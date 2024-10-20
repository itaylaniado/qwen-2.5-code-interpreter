import * as webllm from "@mlc-ai/web-llm";
import { PyodideResult } from "../app/hooks/usePyodide";
import { extractCodeFromMarkdown } from "./markdownParser";

const SYSTEM_PROMPT = `The user will ask you a tricky question, your job is to write Python code to answer the question.

Really think step by step before writing any code to ensure you're writing the correct code to answer the question correctly.

Respond with a markdown code block starting with \`\`\`python and \`\`\` at the end. Make sure the code can be executed without any changes.`;

const EXPLANATION_PROMPT = (result: string, stdout: string) => 
  `Awesome! I ran your code that helped me answer my question. It returned ${result} and the printed output: ${stdout}.
Now respond to my original question using the result and the printed output, ignoring any message before this one.`;

let engine: webllm.MLCEngine | null = null;
let progressCallback: ((progress: string) => void) | null = null;

export interface Message {
  content: string;
  role: "system" | "user" | "assistant";
}

export interface StreamingCallbacks {
  onResultUpdate: (result: string) => void;
  onCodeOutputUpdate: (output: string | null) => void;
  onExplanationUpdate: (explanation: string | null) => void;
  onErrorUpdate: (hasError: boolean) => void;
  onUsageUpdate: (usage: webllm.CompletionUsage) => void;
}

export async function initializeWebLLMEngine(
  selectedModel: string,
  temperature: number,
  topP: number,
  onCompletion: () => void,
): Promise<void> {
  try {
    engine = new webllm.MLCEngine();
    engine.setInitProgressCallback(handleEngineInitProgress);

    const config = { temperature, top_p: topP };
    await engine.reload(selectedModel, config);
    onCompletion();
  } catch (error) {
    console.error("Error loading model:", error);
    throw error;
  }
}

export function setProgressCallback(
  callback: (progress: string) => void,
): void {
  progressCallback = callback;
}

function handleEngineInitProgress(report: { text: string }): void {
  if (progressCallback) {
    progressCallback(report.text);
  }
}

export async function streamResponse(
  messages: webllm.ChatCompletionMessageParam[],
  onUpdate: (currentMessage: string) => void,
  onFinish: (finalMessage: string, usage: webllm.CompletionUsage) => void,
  onError: (error: Error) => void,
): Promise<void> {
  if (!engine) {
    onError(new Error("Engine not initialized"));
    return;
  }

  try {
    let currentMessage = "";
    let usage: webllm.CompletionUsage | undefined;

    const completion = await engine.chat.completions.create({
      stream: true,
      messages,
      stream_options: { include_usage: true },
    });

    for await (const chunk of completion) {
      const delta = chunk.choices[0]?.delta.content;
      if (delta) currentMessage += delta;
      if (chunk.usage) {
        usage = chunk.usage;
      }
      onUpdate(currentMessage);
    }

    const finalMessage = await engine.getMessage();
    if (usage) {
      onFinish(finalMessage, usage as webllm.CompletionUsage);
    } else {
      throw new Error("Usage data not available");
    }
  } catch (error) {
    onError(error as Error);
  }
}

/* 
  This is a list of all available models via MLC which can
  be found here: https://github.com/mlc-ai/web-llm/blob/767e1100b0d850b6157ef1ef6a01137508458ff8/src/config.ts#L308
*/
export const availableModels: string[] = webllm.prebuiltAppConfig.model_list
  .filter((model) => model.model_type !== 1 && model.model_type !== 2) // filter out embedding / vlms
  .map((model) => model.model_id);

export async function handleUserInput(
  input: string,
  executePython: (code: string) => Promise<PyodideResult>,
  callbacks: StreamingCallbacks
): Promise<void> {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: input },
  ];

  try {
    await streamResponse(
      messages as Message[],
      callbacks.onResultUpdate,
      async (aiResponse: string, usage: webllm.CompletionUsage) => {
        callbacks.onResultUpdate(aiResponse);
        callbacks.onUsageUpdate(usage);

        const pythonCode = extractCodeFromMarkdown(aiResponse);

        if (pythonCode) {
          await runAndExplainCode(pythonCode, executePython, callbacks, messages as Message[],);
        }
      },
      (error: Error) => handleError(error, callbacks)
    );
  } catch (err) {
    handleError(err as Error, callbacks);
  }
}

/* 
  We run the code in pyodide and then generate an explanation for the code.
  We only send the parsed python code to pyodide to execute, not the entire markdown block (_which may contain hallucinations_).
*/
async function runAndExplainCode(
  pythonCode: string,
  executePython: (code: string) => Promise<PyodideResult>,
  callbacks: StreamingCallbacks,
  messages: Message[],
): Promise<void> {
  try {
    const { results, error }: PyodideResult = await executePython(pythonCode);
    if (error) {
      handleError(new Error(error), callbacks);
    } else if (results) {
      const { stdout, result } = results;
      callbacks.onCodeOutputUpdate(`Output:\n${stdout}\nResult: ${result}`);
      await generateExplanation(messages, "```python\n" + pythonCode + "\n```", { stdout, result: result as string }, callbacks);
    }
  } catch (err) {
    handleError(err as Error, callbacks);
  }
}

/* 
  We generate an explanation for the code by appending the code to the messages
  and then appending the explanation prompt.
*/
async function generateExplanation(
  messages: Message[],
  aiResponse: string,
  executionResults: { stdout: string; result: string },
  callbacks: StreamingCallbacks
): Promise<void> {
  const explanationMessages = [
    ...messages,
    { role: "assistant", content: aiResponse },
    { role: "user", content: EXPLANATION_PROMPT(executionResults.result, executionResults.stdout) },
  ];

  await streamResponse(
    explanationMessages as Message[],
    callbacks.onExplanationUpdate,
    (explanation: string, explanationUsage: webllm.CompletionUsage) => {
      callbacks.onExplanationUpdate(explanation);
      callbacks.onUsageUpdate(explanationUsage);
    },
    (error: Error) => handleError(error, callbacks, "Error generating explanation")
  );
}

function handleError(error: Error, callbacks: StreamingCallbacks, prefix: string = ""): void {
  callbacks.onErrorUpdate(true);
  const errorMessage = prefix ? `${prefix}: ${error.message}` : error.message;
  callbacks.onResultUpdate(errorMessage);
}

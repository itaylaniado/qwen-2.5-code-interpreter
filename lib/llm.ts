import * as webllm from "@mlc-ai/web-llm";
import { PyodideResult } from "../app/hooks/usePyodide";
import { extractCodeFromMarkdown } from "./markdownParser";
import { SYSTEM_PROMPT } from "./prompts"; // Removed unused EXPLANATION_PROMPT

// Add constant for context length
const MAX_CONTEXT_LENGTH = 32768;

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

export interface ExecutionResult {
  stdout: string;
  result: string;
}

// Added error handling functions
function handleError(error: Error, callbacks: StreamingCallbacks): void {
  console.error(error);
  callbacks.onErrorUpdate(true);
  callbacks.onResultUpdate(`Error: ${error.message}`);
}

async function handleCodeError(
  error: string,
  pythonCode: string,
  executePython: (code: string) => Promise<PyodideResult>,
  callbacks: StreamingCallbacks,
  messages: Message[]
): Promise<void> {
  try {
    const errorMessage = `The code execution resulted in an error: ${error}\nCode:\n${pythonCode}`;
    messages.push({ role: "user", content: errorMessage });
    
    await streamResponse(
      messages,
      callbacks.onResultUpdate,
      async (response: string, usage: webllm.CompletionUsage) => {
        callbacks.onResultUpdate(response);
        callbacks.onUsageUpdate(usage);
        const fixedCode = extractCodeFromMarkdown(response);
        if (fixedCode) {
          await runAndExplainCode(fixedCode, executePython, callbacks, messages);
        }
      },
      (err: Error) => handleError(err, callbacks)
    );
  } catch (err) {
    handleError(err as Error, callbacks);
  }
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

    const config = { 
      temperature, 
      top_p: topP,
      max_tokens: MAX_CONTEXT_LENGTH,
      repetition_penalty: 1.1,  // Add some penalty for repetitions
    };
    
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
      max_tokens: MAX_CONTEXT_LENGTH,
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
      // Allow LLM to attempt recovery by sending the error back
      await handleCodeError(error, pythonCode, executePython, callbacks, messages);
    } else if (results) {
      const { stdout, result } = results;
      let output = '';
      if (stdout != null && stdout !== '' && stdout !== 'null') output += `${stdout}\n`;
      if (result != null && result !== '' && result !== 'null') output += `${result}`;
      
      if (output) {
        callbacks.onCodeOutputUpdate(output.trim());
      }

      // Add execution result to messages for context
      messages.push({
        role: "assistant",
        content: "The code executed successfully with the following output: " + output
      });
    }
  } catch (err) {
    handleError(err as Error, callbacks);
  }
}

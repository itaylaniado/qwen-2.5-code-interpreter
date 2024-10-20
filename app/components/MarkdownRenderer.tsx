import React from 'react';
import ReactMarkdown from 'react-markdown';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import type { Options as ReactMarkdownOptions } from 'react-markdown';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';

SyntaxHighlighter.registerLanguage('typescript', typescript);
SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('python', python);

interface CodeBlockProps {
  language: string;
  value: string;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ language, value }) => {
  return (
    <div className="relative group">
      <div className="absolute top-0 right-0 bg-accent text-accent-foreground rounded-bl px-1.5 py-0.5 text-[10px] font-mono tracking-wide opacity-70 transition-opacity group-hover:opacity-100">
        {language}
      </div>
      <SyntaxHighlighter 
        language={language} 
        style={oneDark} 
        showLineNumbers={true}
        className="rounded-md text-xs overflow-x-auto pt-5"
      >
        {value}
      </SyntaxHighlighter>
    </div>
  );
};

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className }) => {
  const components: ReactMarkdownOptions['components'] = {
    code: ({ className, children, ...props }) => {
      const match = /language-(\w+)/.exec(className || '');
      const language = match ? match[1] : '';
      const value = String(children).replace(/\n$/, '');

      return language ? (
        <CodeBlock
          language={language}
          value={value}
          {...props}
        />
      ) : (
        <code className="px-1 py-0.5 rounded bg-muted text-muted-foreground text-xs" {...props}>
          {children}
        </code>
      );
    },
  };

  return (
    <div className={`prose prose-sm prose-invert max-w-none ${className || ''}`}>
      <ReactMarkdown
        components={components}
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;

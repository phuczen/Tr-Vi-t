
import React, { useEffect, useRef } from 'react';
import { useApp } from '../App';

const parseInlineFormatting = (text: string): React.ReactNode[] => {
    // Regex to split by **...** or *...* while keeping the delimiters.
    // Handles non-nested cases.
    const parts = text.split(/(\*\*.*?\*\*|\*.*?\*)/g).filter(part => part);

    return parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={index}>{part.substring(2, part.length - 2)}</strong>;
        }
        if (part.startsWith('*') && part.endsWith('*')) {
            return <em key={index}>{part.substring(1, part.length - 1)}</em>;
        }
        return <React.Fragment key={index}>{part}</React.Fragment>;
    });
};

interface MarkdownRendererProps {
    markdown: string;
    placeholder: string;
    images?: Record<string, string>;
    imageLoadingStates?: Record<string, 'loading' | 'error'>;
}


// Helper component to render Markdown, LaTeX, and image placeholders
const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ markdown, placeholder, images, imageLoadingStates }) => {
    const { t } = useApp();
    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Robustness check: Ensure both the katex library and the auto-render extension are fully loaded
        // before attempting to render math. The error "Cannot read properties of undefined (reading 'ParseError')"
        // occurs when `renderMathInElement` is called but the global `katex` object it depends on is not yet available.
        if (contentRef.current && (window as any).renderMathInElement && (window as any).katex) {
            try {
                (window as any).renderMathInElement(contentRef.current, {
                    delimiters: [
                        {left: '$$', right: '$$', display: true},
                        {left: '$', right: '$', display: false},
                        {left: '\\(', right: '\\)', display: false},
                        {left: '\\[', right: '\\]', display: true}
                    ],
                    throwOnError: false
                });
            } catch (error) {
                // This error should now be prevented by the guard condition above, but we log it just in case.
                console.error("KaTeX rendering error:", error);
            }
        }
    }, [markdown]);

    if (!markdown) {
        return <div className="flex items-center justify-center h-full text-slate-500 text-center p-4">{placeholder}</div>;
    }

    const renderLine = (line: string, index: number) => {
        const trimmedLine = line.trim();
        
        // Check for the standardized image tag: [IMAGE: prompt]
        const imageMatch = trimmedLine.match(/^\[IMAGE:\s*(.*?)\]$/);
        if (imageMatch) {
            const tag = trimmedLine; // The full tag key
            const prompt = imageMatch[1];
            const loadingState = imageLoadingStates?.[tag];
            const imageData = images?.[tag];

            if (imageData) {
                return (
                    <div key={index} className="my-4 flex justify-center">
                        <img src={imageData} alt={prompt} className="max-w-full md:max-w-lg rounded-lg shadow-lg bg-slate-200" />
                    </div>
                );
            }

            if (loadingState === 'loading') {
                return (
                    <div key={index} className="my-4 flex justify-center">
                        <div className="w-full md:max-w-lg h-56 bg-slate-200/70 rounded-lg flex items-center justify-center animate-pulse">
                            <div className="text-center text-slate-500">
                                <svg className="w-10 h-10 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                <p className="mt-2 text-sm">{t('generating')}...</p>
                            </div>
                        </div>
                    </div>
                );
            }

            if (loadingState === 'error') {
                return (
                    <div key={index} className="my-4 flex justify-center">
                        <div className="w-full md:max-w-lg h-56 bg-red-100/50 border border-red-200 rounded-lg flex flex-col items-center justify-center text-red-600 text-sm p-4">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mb-2" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                            <span className="text-center">{t('image_generation_error')}</span>
                        </div>
                    </div>
                );
            }
            // If neither loaded, loading, nor error (e.g. initially), we render nothing or the text. 
            // Rendering null hides the [IMAGE: ...] text from the user view.
            return null; 
        }
        
        if (trimmedLine.startsWith('# ')) {
            return <h1 key={index} className="text-2xl sm:text-3xl font-bold mt-6 mb-4 text-indigo-700 border-b border-indigo-300 pb-2">{parseInlineFormatting(trimmedLine.substring(2))}</h1>;
        }
        if (trimmedLine.startsWith('## ')) {
            return <h2 key={index} className="text-xl sm:text-2xl font-semibold mt-5 mb-3 text-sky-700">{parseInlineFormatting(trimmedLine.substring(3))}</h2>;
        }
        if (trimmedLine.startsWith('### ')) {
            return <h3 key={index} className="text-lg sm:text-xl font-bold mt-8 mb-4 bg-slate-100 p-3 rounded-lg border-l-4 border-indigo-500">{parseInlineFormatting(trimmedLine.substring(4))}</h3>;
        }
         if (trimmedLine.startsWith('- ')) {
            return <li key={index} className="ml-6 text-slate-700">{parseInlineFormatting(trimmedLine.substring(2))}</li>;
        }
        if (/^\s*\*{0,2}\s*\d+\.\s/.test(trimmedLine)) {
            const cleanLine = trimmedLine.replace(/^\s*\*{0,2}\s*/, '');
            return <p key={index} className="font-medium mt-6">{parseInlineFormatting(cleanLine)}</p>;
        }
        if (/^[A-Z]\.\s/.test(trimmedLine)) {
            return <p key={index} className="ml-8 text-slate-700">{parseInlineFormatting(trimmedLine)}</p>;
        }
        if (trimmedLine.startsWith('[VISUAL:')) { // Keep old visual tag for slide generator
             const description = trimmedLine.replace('[VISUAL:', '').replace(']', '').trim();
             return (
                <div key={index} className="ml-8 my-3 p-3 border border-dashed border-sky-400/50 bg-sky-100 rounded-lg text-sky-800 text-sm italic flex items-center gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" /></svg>
                    <span>{`Gợi ý hình ảnh/minh họa: ${description}`}</span>
                </div>
            );
        }
        if (trimmedLine === '---') {
            return <hr key={index} className="my-6 border-slate-300" />;
        }
        if (trimmedLine === '') {
            return <div key={index} className="h-2"></div>;
        }
        return <p key={index} className="text-slate-700">{parseInlineFormatting(trimmedLine)}</p>;
    };

    return (
        <div ref={contentRef} className="prose prose-sm sm:prose-base max-w-none h-full p-4 sm:p-6 space-y-2">
            {markdown.split('\n').map(renderLine)}
        </div>
    );
};

export default MarkdownRenderer;


import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { useApp } from '../App';
import { LibraryItemType, UserRole } from '../types';

// Make sure KaTeX is available on the window object
declare global {
    interface Window {
        katex: any;
    }
}

const copyToClipboard = async (text: string) => {
    try {
        await navigator.clipboard.writeText(text);
        return; // Success, exit
    } catch (err) {
        // This can happen if the document is not focused. Proceed to fallback.
    }

    // Fallback method using execCommand
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.top = "-9999px";
    textArea.style.left = "-9999px";
    document.body.appendChild(textArea);
    textArea.select();
    try {
        const successful = document.execCommand('copy');
        if (!successful) {
            throw new Error('Fallback: Unable to copy content.');
        }
    } catch (err) {
        throw new Error(`Fallback: Copying failed with error: ${err}`);
    } finally {
        document.body.removeChild(textArea);
    }
};

const SlideContentRenderer: React.FC<{ markdown: string, placeholder: string }> = ({ markdown, placeholder }) => {
    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (contentRef.current && (window as any).renderMathInElement && window.katex) {
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
                console.error("KaTeX rendering error in slides:", error);
            }
        }
    }, [markdown]);

    if (!markdown) {
        return <div className="flex items-center justify-center h-full text-slate-500">{placeholder}</div>;
    }

    const renderLine = (line: string, index: number) => {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('# ')) {
            return <h1 key={index} className="text-xl sm:text-2xl font-bold mt-6 mb-3 text-indigo-700 border-b border-indigo-400/50 pb-2">{trimmedLine.substring(2)}</h1>;
        }
        if (trimmedLine.startsWith('## ')) {
            return <h2 key={index} className="text-lg sm:text-xl font-semibold mt-4 mb-2 text-sky-700">{trimmedLine.substring(3)}</h2>;
        }
        if (trimmedLine.startsWith('- ')) {
            return <li key={index} className="ml-6 text-slate-600">{trimmedLine.substring(2)}</li>;
        }
        if (trimmedLine.startsWith('[VISUAL:')) {
             const description = trimmedLine.replace('[VISUAL:', '').replace(']', '').trim();
             return (
                <div key={index} className="ml-2 my-3 p-3 border border-dashed border-sky-400/50 bg-sky-100 rounded-lg text-sky-800 text-sm italic flex items-center gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" /></svg>
                    <span>{`Gợi ý hình ảnh: ${description}`}</span>
                </div>
            );
        }
        if (trimmedLine === '---') {
            return <hr key={index} className="my-6 border-slate-300" />;
        }
        if (trimmedLine === '') {
            return <div key={index} className="h-2"></div>;
        }
        return <p key={index} className="text-slate-600">{trimmedLine}</p>;
    };

    return (
        <div ref={contentRef} className="prose prose-sm sm:prose-base max-w-none h-full p-4 sm:p-6 space-y-1">
            {markdown.split('\n').map(renderLine)}
        </div>
    );
};


const SlideGenerator: React.FC = () => {
    const { t, language } = useApp();
    const [topic, setTopic] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [fileName, setFileName] = useState('');
    const [markdownContent, setMarkdownContent] = useState('');
    const [wordContent, setWordContent] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copyAsTextButtonText, setCopyAsTextButtonText] = useState(t('copy_as_text'));
    const [copyForWordButtonText, setCopyForWordButtonText] = useState(t('copy_for_word'));
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setCopyAsTextButtonText(t('copy_as_text'));
        setCopyForWordButtonText(t('copy_for_word'));
    }, [markdownContent, t]);


    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
            setFileName(selectedFile.name);
        } else {
            setFile(null);
            setFileName('');
        }
    };

    const handleGenerate = async () => {
        if (!topic.trim()) return;
        setIsLoading(true);
        setMarkdownContent('');
        setWordContent('');
        setError(null);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

            const fileToGenerativePart = async (file: File) => {
                const base64EncodedDataPromise = new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                    reader.readAsDataURL(file);
                });
                return {
                    inlineData: {
                        data: await base64EncodedDataPromise,
                        mimeType: file.type,
                    },
                };
            };
            
            const parts: any[] = [];
            
            let prompt = `
                Act as an expert instructional designer. Create a slide presentation outline based on the provided topic.
                Topic: "${topic}"

                ${file ? "The user has provided a template image file. Analyze its layout, style, and structure to inform your output, but do not simply copy it. Prioritize creating informative content." : ""}

                **CRITICAL LANGUAGE RULE (MUST FOLLOW):**
                The user has explicitly selected **${language}** as their interface language.
                - Your entire response, including all titles, content, bullet points, speaker notes, and visual suggestions MUST be in **${language}**.
                - **EVEN IF** the input topic or template is in English, you **MUST TRANSLATE** the generated content to **${language}**.
                - Do NOT output English unless **${language}** is explicitly English.

                **Structure & Formatting**:
                    - You MUST provide: a concise **Title**, key **Content** points as a bulleted list (3-5 points), and detailed **Speaker Notes**.
                    - Create a logical flow for 5-10 slides.
                    - For visuals, use the tag: \`[VISUAL: A clear, concise description in ${language}.]\`.
                    - You MUST use Markdown strictly: \`# Slide [Number]: [Title]\`, \`## Content\`, \`## Speaker Notes\`, \`---\` to separate slides.
                    - Use LaTeX for math: \`$...$\` (inline), \`$$...$$\` (block).
                
                **CRITICAL OUTPUT FORMAT:**
                Your entire response MUST be a single, valid JSON object in ${language}.
                This object MUST have two keys:
                1.  \`markdownContent\`: The content formatted with Markdown and LaTeX for web display.
                2.  \`wordContent\`: The same content, but with LaTeX converted to Microsoft Word's native Equation format (UnicodeMath) for direct copy-pasting.

                Do not include any text, explanations, or markdown formatting outside of this JSON object.
            `;

            parts.push({text: prompt});
            if(file) {
                 parts.unshift(await fileToGenerativePart(file));
            }

            const responseSchema = {
                type: Type.OBJECT,
                properties: {
                    markdownContent: { type: Type.STRING, description: `Content with Markdown and LaTeX in ${language}.` },
                    wordContent: { type: Type.STRING, description: `Content with UnicodeMath for MS Word in ${language}.` }
                },
                required: ['markdownContent', 'wordContent']
            };

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-pro',
                contents: { parts },
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: responseSchema
                }
            });

            const result = JSON.parse(response.text || '{}');
            setMarkdownContent(result.markdownContent || '');
            setWordContent(result.wordContent || '');

        } catch (e) {
            console.error("Error generating slides:", e);
            setError("Sorry, an error occurred while generating the slides. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleCopyAsText = () => {
        if (!markdownContent) return;

        // A simple conversion to plain text that is more copy-paste friendly.
        const plainText = markdownContent
            .replace(/^# Slide \d+:\s*/gm, 'Slide: ') // Titles
            .replace(/^##\s*/gm, '\n') // Subheadings
            .replace(/^- \s*/gm, '- ') // Bullets
            .replace(/\[VISUAL:\s*(.*?)\]/g, '\n[Visual Suggestion: $1]\n')
            .replace(/\$\$(.*?)\$\$/g, '$1') // Remove block LaTeX delimiters
            .replace(/\$(.*?)\$/g, '$1') // Remove inline LaTeX delimiters
            .trim();
        
        copyToClipboard(plainText)
            .then(() => {
                setCopyAsTextButtonText(t('copied'));
                setTimeout(() => setCopyAsTextButtonText(t('copy_as_text')), 2000);
            })
            .catch(err => {
                console.error('Failed to copy text:', err);
                alert('Could not copy text.');
            });
    };

    const handleCopyToWord = () => {
        if (!wordContent) return;
        copyToClipboard(wordContent)
            .then(() => {
                setCopyForWordButtonText(t('copied'));
                setTimeout(() => setCopyForWordButtonText(t('copy_for_word')), 2000);
            })
            .catch(err => {
                console.error('Failed to copy text for Word:', err);
                alert('Failed to copy content for Word.');
            });
    };


    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Configuration Section */}
            <div className="lg:col-span-1 bg-white/80 backdrop-blur-lg border border-slate-200 shadow-sm p-6 rounded-2xl space-y-4">
                <h3 className="text-xl font-semibold text-slate-900 mb-4">{t('slide_generator')}</h3>
                <div>
                    <label className="block text-sm font-medium text-slate-600 mb-2">{t('presentation_topic')}</label>
                    <input
                        type="text"
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        placeholder={t('topic_placeholder')}
                        className="w-full p-2.5 bg-slate-100 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-600 mb-2">{t('upload_template')}</label>
                     <div className="flex items-center gap-3">
                         <input 
                            ref={fileInputRef}
                            type="file" 
                            onChange={handleFileChange} 
                            accept="image/*" 
                            className="hidden"
                        />
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors text-sm font-medium"
                        >
                            {t('choose_file')}
                        </button>
                        <span className="text-sm text-slate-500 truncate flex-1">
                            {fileName || t('no_file_chosen')}
                        </span>
                    </div>
                </div>
                <button onClick={handleGenerate} disabled={isLoading || !topic.trim()} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold py-3 px-4 rounded-lg hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 transition-all duration-300 transform hover:scale-105 mt-4">
                    {isLoading ? t('generating') : t('generate_slides')}
                </button>
                <div className="flex items-center gap-2 mt-2">
                    {markdownContent && !isLoading && (
                           <div className="w-full flex gap-2">
                                <button 
                                    onClick={handleCopyAsText} 
                                    className="flex-1 text-sm bg-slate-500 text-white font-bold py-3 px-4 rounded-lg hover:bg-slate-600 transition-all duration-300 transform hover:scale-105">
                                    {copyAsTextButtonText}
                                </button>
                                <button 
                                    onClick={handleCopyToWord} 
                                    className="flex-1 text-sm bg-blue-500 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-all duration-300 transform hover:scale-105">
                                    {copyForWordButtonText}
                                </button>
                           </div>
                    )}
                </div>
            </div>
            {/* Output Section */}
            <div className="lg:col-span-2 bg-white/80 backdrop-blur-lg border border-slate-200 shadow-sm p-2 rounded-2xl min-h-[600px]">
                 {isLoading ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-indigo-500"></div>
                    </div>
                ) : error ? (
                    <div className="flex items-center justify-center h-full text-red-600 p-4 text-center">{error}</div>
                ) : (
                     <div className="h-full overflow-y-auto bg-white rounded-lg custom-scrollbar">
                        <SlideContentRenderer markdown={markdownContent} placeholder={t('slide_placeholder')} />
                    </div>
                )}
            </div>
        </div>
    );
};

export default SlideGenerator;

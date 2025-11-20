
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Type, Part } from "@google/genai";
import { useApp } from '../App';
import { Flashcard, MindMapNode, LibraryItemType, UserRole } from '../types';
import MindMapComponent from './MindMap';

const FlashcardComponent: React.FC<{ card: Flashcard }> = ({ card }) => {
    const [flipped, setFlipped] = useState(false);
    const frontRef = useRef<HTMLDivElement>(null);
    const backRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const renderMath = (element: HTMLDivElement | null, content: string) => {
            if (element && (window as any).renderMathInElement && window.katex) {
                const p = element.querySelector('p');
                if (p) {
                    p.textContent = content; // Set raw text first
                    try {
                        (window as any).renderMathInElement(element, {
                            delimiters: [
                                {left: '$$', right: '$$', display: true},
                                {left: '$', right: '$', display: false},
                            ],
                            throwOnError: false
                        });
                    } catch (e) { console.error("KaTeX rendering error in flashcard:", e); }
                }
            }
        };
        renderMath(frontRef.current, card.question);
        renderMath(backRef.current, card.answer);
    }, [card, flipped]);

    return (
        <div
            className="w-full h-56 [perspective:1000px] group cursor-pointer"
            onClick={() => setFlipped(!flipped)}
        >
            <div className={`relative w-full h-full transition-transform duration-700 [transform-style:preserve-3d] ${flipped ? '[transform:rotateY(180deg)]' : ''}`}>
                {/* Front */}
                <div ref={frontRef} className="absolute w-full h-full bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-center text-center [backface-visibility:hidden]">
                    <p className="text-lg font-semibold">{card.question}</p>
                </div>
                {/* Back */}
                <div ref={backRef} className="absolute w-full h-full bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-center justify-center text-center text-indigo-900 [transform:rotateY(180deg)] [backface-visibility:hidden]">
                    <p className="text-lg">{card.answer}</p>
                </div>
            </div>
        </div>
    );
};


const Summarizer: React.FC = () => {
    const { t, language, userRole, addToLibrary } = useApp();
    const [mindMap, setMindMap] = useState<MindMapNode | null>(null);
    const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [outputTab, setOutputTab] = useState<'mind_map' | 'flashcards'>('mind_map');
    const [fileName, setFileName] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [saveButtonText, setSaveButtonText] = useState(t(userRole === UserRole.TEACHER ? 'save_to_documents' : 'save_to_library'));
    const fileInputRef = useRef<HTMLInputElement>(null);

    const resetSaveButton = () => {
      setSaveButtonText(t(userRole === UserRole.TEACHER ? 'save_to_documents' : 'save_to_library'));
    }
    
    useEffect(() => {
        resetSaveButton();
    }, [t, userRole]);


    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
            setFileName(selectedFile.name);
            resetSaveButton();
        } else {
            setFile(null);
            setFileName('');
        }
    };
    
    const handleSave = () => {
        if (!mindMap) return;

        const name = `${t('summary')} - ${fileName || mindMap.title}`;
        addToLibrary({
            name,
            type: LibraryItemType.SUMMARY,
            content: { mindMap }
        });
        setSaveButtonText(t('saved'));
        setTimeout(() => resetSaveButton(), 2000);
    };

    const handleSummarize = async () => {
        if (!file) {
            return;
        }

        setIsLoading(true);
        setMindMap(null);
        setFlashcards([]);
        setError(null);
        resetSaveButton();

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

            const parts: Part[] = [];

            const basePrompt = `
                You are a highly precise AI content analyzer. Your task is to process the provided content and generate a mind map and flashcards.

                **CRITICAL LANGUAGE RULE (MUST FOLLOW):**
                The user has explicitly selected **${language}** as their interface language.
                - You MUST generate ALL output (titles, questions, answers, nodes) in **${language}**.
                - **EVEN IF** the input file is in English, Chinese, or any other language, you **MUST TRANSLATE** the extracted information into **${language}**.
                - Do NOT output English unless **${language}** is explicitly English.

                **Formatting Rules:**
                1.  **Handling Mathematical Content**: If the content contains mathematical formulas or equations, you MUST represent them using proper LaTeX. Use \`$...$\` for inline math and \`$$...$$\` for block-level equations. For example, represent the quadratic formula as \`$$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$$\`.
                2.  **JSON Output**: Return ONLY a valid JSON object.

                **Process:**
                1.  **Core Topic Identification:** Identify the main topic.
                2.  **Information Extraction & Translation:** Extract key facts and IMMEDIATELY translate them to **${language}**.
                3.  **Structure:** Create a mind map and flashcards from this translated content.
            `;

            parts.push(await fileToGenerativePart(file));
            
            const prompt = `
                **Input Context:** The filename is "${file.name}".
                **WEIGHTING RULE (90/10):** 
                1.  **10% Weight:** Use the filename only as a weak context clue.
                2.  **90% Weight:** You MUST derive the topic and summary content primarily from the **actual file content** (text, images, audio) provided in the user input.
                3.  **Conflict Resolution:** If the filename is generic (e.g., "untitled", "doc", "image", "download") or if it contradicts the actual content of the file, **IGNORE the filename** and trust the content completely.

                ${basePrompt}
            `;
            
            parts.push({ text: prompt });
            
             const responseSchema = {
                type: Type.OBJECT,
                properties: {
                    mindMap: {
                        type: Type.OBJECT,
                        description: 'The root node of the mind map.',
                        properties: {
                            title: { type: Type.STRING, description: `The main topic of the mind map in ${language}.` },
                            children: {
                                type: Type.ARRAY,
                                description: 'An array of child nodes for the key concepts.',
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        title: { type: Type.STRING, description: `The title of the key concept in ${language}.` },
                                        children: {
                                            type: Type.ARRAY,
                                            description: 'An array of sub-nodes for more detailed points.',
                                            items: {
                                                type: Type.OBJECT,
                                                properties: {
                                                    title: { type: Type.STRING, description: `The title of the sub-point in ${language}.` },
                                                },
                                                required: ['title']
                                            }
                                        }
                                    },
                                    required: ['title']
                                }
                            }
                        },
                        required: ['title']
                    },
                    flashcards: {
                        type: Type.ARRAY,
                        description: 'A list of flashcards for studying.',
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                question: { type: Type.STRING, description: `The question side of the flashcard in ${language}.` },
                                answer: { type: Type.STRING, description: `The answer side of the flashcard in ${language}.` }
                            },
                            required: ['question', 'answer']
                        }
                    }
                },
                required: ['mindMap', 'flashcards']
            };

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-pro',
                contents: { parts },
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: responseSchema,
                },
            });

            const jsonString = (response.text || '').trim();
            if (!jsonString) {
                throw new Error("Received an empty response from the API.");
            }
            const result = JSON.parse(jsonString);

            setMindMap(result.mindMap);
            setFlashcards(result.flashcards);

        } catch (e) {
            console.error("Error generating summary:", e);
            setError("Sorry, an error occurred while generating the summary. The content might be unsupported or an API error occurred. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Input Section */}
            <div className="lg:col-span-1 bg-white/80 backdrop-blur-sm border border-slate-200 shadow-sm p-6 rounded-2xl">
                <h3 className="text-xl font-semibold text-slate-900 mb-4 border-b border-slate-300 pb-3">{t('upload_file')}</h3>
                <div className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-600 mb-2">{t('file_placeholder')}</label>
                        <div className="flex items-center gap-3">
                             <input 
                                ref={fileInputRef}
                                type="file" 
                                onChange={handleFileChange} 
                                accept="image/*,audio/*,video/*,.pdf" 
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
                    
                    <button onClick={handleSummarize} disabled={isLoading || !file} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold py-3 px-4 rounded-lg hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105">
                        {isLoading ? t('generating') : t('summarize')}
                    </button>
                </div>
            </div>
            {/* Output Section */}
            <div className="lg:col-span-2 bg-white/80 backdrop-blur-sm border border-slate-200 shadow-sm p-6 rounded-2xl min-h-[400px]">
                 {isLoading ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-indigo-500"></div>
                    </div>
                ) : error ? (
                    <div className="flex items-center justify-center h-full text-red-600 p-4 text-center">{error}</div>
                ) : !mindMap && !flashcards.length ? (
                    <div className="flex items-center justify-center h-full text-slate-500">
                        {t('summary_placeholder')}
                    </div>
                ) : (
                    <div>
                        <div className="flex justify-between items-center border-b border-slate-300 mb-4">
                            <div className="flex">
                               <button onClick={() => setOutputTab('mind_map')} className={`px-4 py-2 font-medium transition-colors duration-300 ${outputTab === 'mind_map' ? 'text-indigo-600 border-b-2 border-indigo-500' : 'text-slate-500 hover:text-slate-900'}`}>{t('mind_map')}</button>
                                <button onClick={() => setOutputTab('flashcards')} className={`px-4 py-2 font-medium transition-colors duration-300 ${outputTab === 'flashcards' ? 'text-indigo-600 border-b-2 border-indigo-500' : 'text-slate-500 hover:text-slate-900'}`}>{t('flashcards')}</button>
                            </div>
                            {mindMap && (
                                <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-sky-600 to-cyan-600 rounded-lg hover:from-sky-700 hover:to-cyan-700 transition-all transform hover:scale-105">
                                    {saveButtonText}
                                </button>
                            )}
                        </div>
                        {outputTab === 'mind_map' && mindMap && <MindMapComponent data={mindMap} />}
                        {outputTab === 'flashcards' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {flashcards.map((card, index) => <FlashcardComponent key={index} card={card} />)}
                            </div>
                        )}
                    </div>
                 )}
            </div>
        </div>
    );
};

export default Summarizer;

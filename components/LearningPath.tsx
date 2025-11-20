
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Type, Modality } from '@google/genai';
import { useApp } from '../App';
import { GRADES, SUBJECTS } from '../constants';
import { Subject, Lesson, LibraryItemType } from '../types';
import MarkdownRenderer from './MarkdownRenderer';

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

const KatexRenderer: React.FC<{ text: string, className: string }> = ({ text, className }) => {
    const ref = useRef<HTMLSpanElement>(null);
    useEffect(() => {
        if (ref.current) {
            ref.current.textContent = text;
            if ((window as any).renderMathInElement && window.katex) {
                 try {
                    (window as any).renderMathInElement(ref.current, {
                        delimiters: [
                            {left: '$$', right: '$$', display: true},
                            {left: '$', right: '$', display: false},
                        ],
                        throwOnError: false
                    });
                } catch (error) {
                    console.error("KaTeX rendering error in Learning Path topic:", error);
                }
            }
        }
    }, [text]);

    return <span ref={ref} className={className}>{text}</span>;
};


// Helper to create a unique key for localStorage based on grade and subject
const getStorageKey = (grade: number, subject: Subject) => `triVietLearningPath_${grade}_${subject}`;

const learningPathSubjects = SUBJECTS.filter(s => s !== Subject.NATURAL_SCIENCES);


const LearningPath: React.FC = () => {
    const { t, language, studentGoal } = useApp();
    const [config, setConfig] = useState({ grade: 10, subject: Subject.MATH });
    const [plan, setPlan] = useState<Lesson[]>([]);
    const [currentLessonIndex, setCurrentLessonIndex] = useState(0);
    const [markdownContent, setMarkdownContent] = useState('');
    const [wordContent, setWordContent] = useState('');
    const [isLoading, setIsLoading] = useState<'plan' | 'lesson' | false>(false);
    const [error, setError] = useState<string | null>(null);
    const [images, setImages] = useState<Record<string, string>>({}); // Maps placeholder to base64 data
    const [imageLoadingStates, setImageLoadingStates] = useState<Record<string, 'loading' | 'error'>>({});
    const [copyAsTextButtonText, setCopyAsTextButtonText] = useState(t('copy_as_text'));
    const [copyForWordButtonText, setCopyForWordButtonText] = useState(t('copy_for_word'));
    const [isReviewSessionActive, setIsReviewSessionActive] = useState(false);


    useEffect(() => {
        setCopyAsTextButtonText(t('copy_as_text'));
        setCopyForWordButtonText(t('copy_for_word'));
    }, [markdownContent, t]);


    // Effect to load progress from localStorage when component mounts or config changes
    useEffect(() => {
        setIsReviewSessionActive(false);
        const storageKey = getStorageKey(config.grade, config.subject);
        try {
            const savedData = localStorage.getItem(storageKey);
            if (savedData) {
                const { savedPlan, savedIndex } = JSON.parse(savedData);
                if (savedPlan && Array.isArray(savedPlan) && typeof savedIndex === 'number') {
                    setPlan(savedPlan);
                    setCurrentLessonIndex(savedIndex);
                    setMarkdownContent(''); // Clear lesson content as it's not saved
                    setWordContent('');
                    setImages({});
                    setImageLoadingStates({});
                    return; // Exit if data is successfully loaded
                }
            }
            // If no data or invalid data, reset the state for the new config
            setPlan([]);
            setCurrentLessonIndex(0);
            setMarkdownContent('');
            setWordContent('');
            setImages({});
            setImageLoadingStates({});
        } catch (e) {
            console.error("Failed to load learning path from localStorage:", e);
             // Reset on error
            setPlan([]);
            setCurrentLessonIndex(0);
            setMarkdownContent('');
            setWordContent('');
            setImages({});
            setImageLoadingStates({});
        }
    }, [config.grade, config.subject]);

    // Effect to save progress to localStorage whenever the plan or current lesson index changes
    useEffect(() => {
        // Only save if there's a valid plan to prevent overwriting with an empty one
        if (plan.length > 0) {
            const storageKey = getStorageKey(config.grade, config.subject);
            try {
                const dataToSave = {
                    savedPlan: plan,
                    savedIndex: currentLessonIndex,
                };
                localStorage.setItem(storageKey, JSON.stringify(dataToSave));
            } catch (e) {
                console.error("Failed to save learning path to localStorage:", e);
            }
        }
    }, [plan, currentLessonIndex, config.grade, config.subject]);

    const handleConfigChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const { name, value } = e.target;
        setConfig(prev => ({ ...prev, [name]: name === 'grade' ? parseInt(value) : value }));
    };

    const generatePlan = async () => {
        setIsLoading('plan');
        setError(null);
        setIsReviewSessionActive(false);
        // Clear any old plan from state and storage before generating a new one
        const storageKey = getStorageKey(config.grade, config.subject);
        localStorage.removeItem(storageKey);
        setPlan([]);
        setMarkdownContent('');
        setWordContent('');
        setImages({});
        setImageLoadingStates({});
        
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const prompt = `
                Create a structured learning plan for a grade ${config.grade} student in ${t(config.subject)}. The student's learning goal is "${t(studentGoal!)}".
                The plan must consist of 5 to 7 logically ordered, distinct lesson topics.
                
                **CRITICAL LANGUAGE RULE (MUST FOLLOW):**
                The user has explicitly selected **${language}** as their interface language.
                - The lesson topics in the JSON output **MUST be exclusively in ${language}**.
                - If the subject name or standard curriculum terms are in English, you **MUST translate** them to **${language}**.
                - Do NOT output English unless **${language}** is explicitly English.

                **LaTeX for Math**: If any lesson topic contains mathematical formulas, variables, or symbols, you MUST use LaTeX for them (e.g., "Hệ phương trình bậc nhất hai ẩn $ax + by = c$"). This is mandatory. Failure to do so is a critical error.

                Your entire response MUST be a single JSON object with a key "plan" which is an array of strings. Each string is a lesson topic.
                Do not include any other text or formatting.
            `;
            
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                 config: {
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            plan: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING }
                            }
                        },
                        required: ['plan']
                    }
                }
            });

            const result = JSON.parse(response.text || '{}');
            if (result.plan && result.plan.length > 0) {
                setPlan(result.plan.map((topic: string) => ({ topic, completed: false })));
                setCurrentLessonIndex(0);
            } else {
                throw new Error("Failed to generate a valid plan.");
            }
        } catch (e) {
            console.error("Error generating plan:", e);
            setError("Sorry, an error occurred while generating the learning plan.");
        } finally {
            setIsLoading(false);
        }
    };

    const generateImagesForLesson = async (text: string) => {
        // More robust regex to handle variations in spacing
        const imageTagsMatches = [...text.matchAll(/\[IMAGE:\s*(.*?)\]/g)];
        if (imageTagsMatches.length === 0) return;

        const imageTags = imageTagsMatches.map(match => match[0]); // Full tags [IMAGE: ...]
        const imagePrompts = imageTagsMatches.map(match => match[1]); // Just the prompts

        const initialLoadingStates: Record<string, 'loading' | 'error'> = {};
        imageTags.forEach(tag => { initialLoadingStates[tag] = 'loading'; });
        setImageLoadingStates(initialLoadingStates);

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

        // Process images one by one to handle errors gracefully
        for (let i = 0; i < imageTags.length; i++) {
            const tag = imageTags[i];
            const prompt = imagePrompts[i];

            if (!prompt || !prompt.trim()) {
                 setImageLoadingStates(prev => ({ ...prev, [tag]: 'error' }));
                 continue;
            }

            try {
                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash-image',
                    contents: { parts: [{ text: prompt }] },
                    config: { responseModalities: [Modality.IMAGE] },
                });

                let base64ImageBytes = '';
                const parts = response.candidates?.[0]?.content?.parts;
                
                if (parts) {
                    for (const part of parts) {
                        if (part.inlineData) {
                            base64ImageBytes = part.inlineData.data;
                            break;
                        }
                    }
                }
                
                if (base64ImageBytes) {
                    setImages(prev => ({ ...prev, [tag]: `data:image/png;base64,${base64ImageBytes}` }));
                    setImageLoadingStates(prev => {
                        const newStates = { ...prev };
                        delete newStates[tag];
                        return newStates;
                    });
                } else {
                     throw new Error('No image data found in response.');
                }
            } catch (e) {
                console.error(`Failed to generate image for tag "${tag}":`, e);
                setImageLoadingStates(prev => ({ ...prev, [tag]: 'error' }));
            }
        }
    };
    
    const baseGenerationLogic = async (prompt: string) => {
        setIsLoading('lesson');
        setError(null);
        setMarkdownContent('');
        setWordContent('');
        setImages({});
        setImageLoadingStates({});
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
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
                contents: prompt,
                 config: {
                    responseMimeType: 'application/json',
                    responseSchema: responseSchema
                }
            });
            const result = JSON.parse(response.text || '{}');
            const lessonText = result.markdownContent || 'No content generated.';
            
            setMarkdownContent(lessonText);
            setWordContent(result.wordContent || '');
            
            if (!isReviewSessionActive) {
                generateImagesForLesson(lessonText);
            }

        } catch (e) {
            console.error("Error generating lesson:", e);
            setError("Sorry, an error occurred while generating the lesson content.");
        } finally {
            setIsLoading(false);
        }
    };


    const generateLesson = async (topic: string) => {
        const prompt = `
            You are an AI Tutor. Create a comprehensive lesson for a grade ${config.grade} student about the topic: "${topic}".
            The student's learning goal is "${t(studentGoal!)}".

            **CRITICAL LANGUAGE RULE (MUST FOLLOW):**
            The user has explicitly selected **${language}** as their interface language.
            - The entire lesson, including all explanations, questions, options, image prompts, and headers (like 'Introduction', 'Exercises'), **MUST be in ${language}**.
            - **Do not output English unless ${language} is explicitly English.**
            - Even if the topic is technical, translate explanations to **${language}**.

            **LaTeX for Math**: You MUST use LaTeX for ALL mathematical content if the subject is Math or involves formulas. Use \`$...$\` for inline and \`$$...$$\` for block. This is a critical rule.
            
            **CRITICAL OUTPUT FORMAT:**
            Your entire response MUST be a single, valid JSON object.
            This object MUST have two keys:
            1.  \`markdownContent\`: The lesson formatted with Markdown and LaTeX for web display. Include image placeholders like \`[IMAGE: a descriptive prompt in ${language}]\`.
            2.  \`wordContent\`: The same lesson, but with LaTeX converted to Microsoft Word's native Equation format (UnicodeMath) for direct copy-pasting.

            **Lesson Structure for \`markdownContent\`:**
            -   **Explanation:** A clear explanation of the main concepts.
            -   **Visual Aids:** Insert 1-2 image placeholders: \`[IMAGE: A concise prompt in ${language}.]\`.
            -   **Multiple Choice Questions:** 3-5 MCQs with 4 options (A, B, C, D).
            -   **Essay Question:** 1 critical thinking question.
            -   **Formatting:** Use Markdown headers (##) for structure.

            Now, generate the lesson content based on these absolute rules.
        `;
        await baseGenerationLogic(prompt);
    };

    const generateReviewLesson = async (reviewType: 'numbers' | 'geometry' | 'both') => {
        setIsReviewSessionActive(true);
        const reviewTopicMap = {
            numbers: t('numbers'),
            geometry: t('geometry'),
            both: t('both')
        };
        const topic = reviewTopicMap[reviewType];
        
        let topicFocusInstruction = '';
        if (reviewType === 'numbers') {
            topicFocusInstruction = "The lesson MUST focus exclusively on Numbers and Algebra. DO NOT include any Geometry topics.";
        } else if (reviewType === 'geometry') {
            topicFocusInstruction = "The lesson MUST focus exclusively on Geometry. DO NOT include any Numbers and Algebra topics.";
        } else { // 'both'
            topicFocusInstruction = "The lesson should provide a balanced review of both Numbers & Algebra and Geometry.";
        }

        const prompt = `
            You are an AI Tutor specializing in ${t(config.subject)}. Create a comprehensive review lesson for a grade ${config.grade} student.
            The student's learning goal is "${t(studentGoal!)}".
            The review topic is: **${topic}**.

            **Topic Focus:** ${topicFocusInstruction}
            
            **CRITICAL LANGUAGE RULE (MUST FOLLOW):**
            The user has explicitly selected **${language}** as their interface language.
            - The entire lesson, including all explanations, exercises, and headers, **MUST be in ${language}**.
            - **Do not output English unless ${language} is explicitly English.**

            **LaTeX for Math**: You MUST use LaTeX for ALL mathematical content. Use \`$...$\` for inline and \`$$...$$\` for block.
            
            **CRITICAL OUTPUT FORMAT:**
            Your entire response MUST be a single, valid JSON object with two keys: \`markdownContent\` and \`wordContent\`, following the same formatting rules as a standard lesson.

            **Lesson Structure for \`markdownContent\`:**
            1.  **Explanation of Key Concepts:** A clear summary of the core theories and formulas.
            2.  **Worked Examples:** Provide 2-3 step-by-step examples.
            3.  **Practice Exercises:** Provide 5-7 practice exercises of varying difficulty, including their solutions.
            4.  **Formatting:** Use Markdown headers (##, ###) for structure.

            Now, generate the review lesson content based on these absolute rules.
        `;
        await baseGenerationLogic(prompt);
    };

    const handleLessonClick = (index: number) => {
        if (index === currentLessonIndex) {
            setIsReviewSessionActive(false);
            generateLesson(plan[index].topic);
        }
    };

    const handleMarkComplete = () => {
        const updatedPlan = [...plan];
        updatedPlan[currentLessonIndex].completed = true;
        setPlan(updatedPlan);

        if (currentLessonIndex < plan.length - 1) {
            setCurrentLessonIndex(currentLessonIndex + 1);
            setMarkdownContent(''); // Clear content for the next lesson
            setWordContent('');
            setImages({});
            setImageLoadingStates({});
        } else {
            // Last lesson completed
            setMarkdownContent(markdownContent + "\n\n---\n\n# Congratulations! You have completed the learning path!");
        }
    };

    const handleCopyAsText = () => {
        if (!markdownContent) return;

        const plainText = markdownContent
            .replace(/## /g, '\n')
            .replace(/### /g, '')
            .replace(/\[IMAGE: (.*?)\]/g, '\n[Image Suggestion: $1]\n')
            .replace(/\$\$(.*?)\$\$/g, '$1')
            .replace(/\$(.*?)\$/g, '$1')
            .replace(/- /g, '- ')
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
            {/* Left Panel: Config and Plan */}
            <div className="lg:col-span-1 bg-white/80 backdrop-blur-sm border border-slate-200 shadow-sm p-6 rounded-2xl flex flex-col space-y-4">
                <h3 className="text-xl font-semibold text-slate-900 mb-2">{t('learning_path')}</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-600">{t('grade')}</label>
                        <select name="grade" value={config.grade} onChange={handleConfigChange} className="mt-1 w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 transition">
                            {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-600">{t('subject')}</label>
                        <select name="subject" value={config.subject} onChange={handleConfigChange} className="mt-1 w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 transition">
                            {learningPathSubjects.map(s => <option key={s} value={s}>{t(s)}</option>)}
                        </select>
                    </div>
                </div>
                <button onClick={generatePlan} disabled={isLoading === 'plan'} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold py-3 rounded-lg disabled:opacity-50 transition-all transform hover:scale-105">
                    {isLoading === 'plan' ? t('generating') : t('generate_plan')}
                </button>

                {plan.length > 0 && config.subject === Subject.MATH && (
                    <div className="mt-2 pt-4 border-t border-slate-200">
                        <h4 className="text-md font-semibold text-slate-700 mb-3">{t('specialized_review')}</h4>
                        <div className="grid grid-cols-3 gap-2">
                             <button onClick={() => generateReviewLesson('numbers')} disabled={isLoading === 'lesson'} className="px-2 py-2 text-sm bg-slate-200 text-slate-800 rounded-lg hover:bg-slate-300 disabled:opacity-50 transition-colors">{t('numbers')}</button>
                             <button onClick={() => generateReviewLesson('geometry')} disabled={isLoading === 'lesson'} className="px-2 py-2 text-sm bg-slate-200 text-slate-800 rounded-lg hover:bg-slate-300 disabled:opacity-50 transition-colors">{t('geometry')}</button>
                             <button onClick={() => generateReviewLesson('both')} disabled={isLoading === 'lesson'} className="px-2 py-2 text-sm bg-slate-200 text-slate-800 rounded-lg hover:bg-slate-300 disabled:opacity-50 transition-colors">{t('both')}</button>
                        </div>
                    </div>
                )}
                
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 -mr-2">
                    {plan.length > 0 ? (
                        <ol className="space-y-3 mt-4">
                            {plan.map((lesson, index) => (
                                <li key={index}>
                                    <button
                                        onClick={() => handleLessonClick(index)}
                                        disabled={index > currentLessonIndex}
                                        className={`w-full text-left p-3 rounded-lg border-l-4 transition-all duration-300 ${
                                            index < currentLessonIndex ? 'bg-green-100 border-green-400 cursor-default' :
                                            index === currentLessonIndex ? 'bg-indigo-100 border-indigo-400 hover:bg-indigo-200/70' :
                                            'bg-slate-200/60 border-slate-300 cursor-not-allowed opacity-70'
                                        }`}
                                    >
                                        <div className="flex justify-between items-center">
                                            <KatexRenderer text={`${index + 1}. ${lesson.topic}`} className="font-medium" />
                                            {index < currentLessonIndex && <span className="text-xs font-bold text-green-600 flex-shrink-0 ml-2">{t('completed')}</span>}
                                            {index === currentLessonIndex && <span className="text-xs font-bold text-indigo-600 flex-shrink-0 ml-2">{t('current_lesson')}</span>}
                                            {index > currentLessonIndex && <span className="text-xs font-bold text-slate-500 flex-shrink-0 ml-2">{t('locked')}</span>}
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ol>
                    ) : isLoading !== 'plan' && (
                         <div className="flex items-center justify-center h-full text-slate-500 text-center p-4">
                            {t('plan_placeholder')}
                        </div>
                    )}
                </div>
            </div>
            {/* Right Panel: Lesson Content */}
            <div className="lg:col-span-2 bg-white/80 backdrop-blur-sm border border-slate-200 shadow-sm p-2 rounded-2xl min-h-[600px] flex flex-col">
                {isLoading === 'lesson' || isLoading === 'plan' ? (
                    <div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-indigo-500"></div></div>
                ) : error ? (
                    <div className="flex items-center justify-center h-full text-red-600 p-4 text-center">{error}</div>
                ) : (
                    <div className="flex-1 h-full overflow-y-auto bg-white rounded-lg custom-scrollbar">
                        <MarkdownRenderer
                            markdown={markdownContent}
                            placeholder={plan.length > 0 ? t('lesson_placeholder') : t('plan_placeholder')}
                            images={images}
                            imageLoadingStates={imageLoadingStates}
                        />
                    </div>
                )}
                 {markdownContent && !isLoading && (
                    <div className="p-4 border-t border-slate-200 flex flex-col sm:flex-row gap-4">
                        {!isReviewSessionActive && currentLessonIndex < plan.length && !plan[currentLessonIndex].completed ? (
                            <button onClick={handleMarkComplete} className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-bold py-3 rounded-lg transition-all transform hover:scale-105">
                                {t('mark_complete')}
                            </button>
                        ) : <div className="flex-1"></div>}
                        <div className="flex-1 flex gap-2">
                             <button 
                                onClick={handleCopyAsText}
                                className="flex-1 bg-slate-500 text-white font-bold py-3 rounded-lg transition-all transform hover:scale-105">
                                {copyAsTextButtonText}
                            </button>
                             <button 
                                onClick={handleCopyToWord}
                                className="flex-1 bg-blue-500 text-white font-bold py-3 rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-all transform hover:scale-105">
                                {copyForWordButtonText}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default LearningPath;

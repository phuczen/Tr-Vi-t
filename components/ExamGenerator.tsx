
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Part, Type, Modality } from '@google/genai';
import { useApp } from '../App';
import { GRADES, SUBJECTS, DIFFICULTY_LEVELS, TEXTBOOKS } from '../constants';
import { Subject, UserRole, DifficultyLevel, LibraryItemType } from '../types';
import MarkdownRenderer from './MarkdownRenderer';

// Audio decoding helper functions
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
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

const examGeneratorSubjects = [
    Subject.MATH,
    Subject.LITERATURE,
    Subject.NATURAL_SCIENCES,
    Subject.HISTORY,
    Subject.GEOGRAPHY,
    Subject.ENGLISH,
    Subject.TECHNOLOGY,
    Subject.CIVIC_EDUCATION,
    Subject.INFORMATICS,
];

const naturalScienceSubSubjects = [Subject.PHYSICS, Subject.CHEMISTRY, Subject.BIOLOGY];

const ExamGenerator: React.FC = () => {
    const { t, language, userRole, addToLibrary } = useApp();
    const [config, setConfig] = useState({
        grade: 10,
        subject: Subject.NATURAL_SCIENCES,
        topic: '',
        textbook: 'none',
        duration: 45,
        numMultipleChoice: 8,
        mcCounts: {
            [DifficultyLevel.RECOGNITION]: 4,
            [DifficultyLevel.COMPREHENSION]: 4,
            [DifficultyLevel.APPLICATION]: 0,
        },
        essayCounts: {
            [DifficultyLevel.RECOGNITION]: 1,
            [DifficultyLevel.COMPREHENSION]: 1,
            [DifficultyLevel.APPLICATION]: 0,
        },
    });
    const [manualTextbook, setManualTextbook] = useState('');
    const [selectedNaturalSciences, setSelectedNaturalSciences] = useState<Subject[]>([Subject.PHYSICS]);
    const [matrixFile, setMatrixFile] = useState<File | null>(null);
    const [matrixFileName, setMatrixFileName] = useState('');
    const [generatedExam, setGeneratedExam] = useState('');
    const [wordContent, setWordContent] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copyAsTextButtonText, setCopyAsTextButtonText] = useState(t('copy_as_text'));
    const [copyForWordButtonText, setCopyForWordButtonText] = useState(t('copy_for_word'));
    const [saveButtonText, setSaveButtonText] = useState(t(userRole === UserRole.TEACHER ? 'save_to_documents' : 'save_to_library'));

    const [generatedAudio, setGeneratedAudio] = useState<string | null>(null);
    const [isAudioLoading, setIsAudioLoading] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const matrixInputRef = useRef<HTMLInputElement>(null);


    const resetSaveButton = () => {
      setSaveButtonText(t(userRole === UserRole.TEACHER ? 'save_to_documents' : 'save_to_library'));
    }

    useEffect(() => {
        setCopyAsTextButtonText(t('copy_as_text'));
        setCopyForWordButtonText(t('copy_for_word'));
        resetSaveButton();
    }, [generatedExam, t, userRole]);


    const handleConfigChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
         if (name === 'subject' && value !== Subject.NATURAL_SCIENCES) {
            setSelectedNaturalSciences([]);
        } else if (name === 'subject' && value === Subject.NATURAL_SCIENCES && selectedNaturalSciences.length === 0) {
            // default to selecting one when switching to it
            setSelectedNaturalSciences([Subject.PHYSICS]);
        }
        if (name === 'textbook' && value !== 'other') {
            setManualTextbook('');
        }
        setConfig(prev => ({ ...prev, [name]: name === 'grade' || name === 'duration' || name === 'numMultipleChoice' ? parseInt(value) : value }));
    };

    const handleNaturalScienceChange = (subSubject: Subject) => {
        setSelectedNaturalSciences(prev => {
            const isSelected = prev.includes(subSubject);
            if (isSelected) {
                return prev.filter(s => s !== subSubject);
            } else {
                return [...prev, subSubject];
            }
        });
    };

    const handleMcCountChange = (level: DifficultyLevel, value: string) => {
        const count = parseInt(value, 10);
        if (isNaN(count) || count < 0) return;
        
        setConfig(prev => ({
            ...prev,
            mcCounts: {
                ...prev.mcCounts,
                [level]: count,
            }
        }));
    };
    
    const handleEssayCountChange = (level: DifficultyLevel, value: string) => {
        const count = parseInt(value, 10);
        if (isNaN(count) || count < 0) return;
        
        setConfig(prev => ({
            ...prev,
            essayCounts: {
                ...prev.essayCounts,
                [level]: count,
            }
        }));
    };


    const handleMatrixFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setMatrixFile(selectedFile);
            setMatrixFileName(selectedFile.name);
        } else {
            setMatrixFile(null);
            setMatrixFileName('');
        }
    };

    const handleGenerate = async () => {
        const totalEssay = Object.values(config.essayCounts).reduce((sum: number, count: number) => sum + count, 0);
        if (!config.topic.trim() || (config.numMultipleChoice === 0 && totalEssay === 0) || isMcCountMismatch) return;

        setIsLoading(true);
        setGeneratedExam('');
        setWordContent('');
        setError(null);
        resetSaveButton();
        setGeneratedAudio(null);
        setIsAudioLoading(false);
        setIsSpeaking(false);
        
        const textbookName = config.textbook === 'other' ? manualTextbook : (config.textbook !== 'none' ? t(config.textbook) : '');

        const isSpecialEnglishExam = config.subject === Subject.ENGLISH &&
            textbookName.trim() &&
            (config.topic.toLowerCase().includes('giữa kì') ||
             config.topic.toLowerCase().includes('cuối kì') ||
             config.topic.toLowerCase().includes('mid-term') ||
             config.topic.toLowerCase().includes('final exam') ||
             config.topic.toLowerCase().includes('end-of-term'));

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            if (isSpecialEnglishExam) {
                 const prompt = `
                    Act as an expert English teacher creating a final exam for a grade ${config.grade} student.
                    The exam must be based on the curriculum from the specified textbook: "${textbookName}".
                    The exam MUST have three sections: LISTENING, READING, and WRITING.

                    **LANGUAGE RULE:** 
                    - The listening script and reading passages should be in English.
                    - However, the **questions, instructions, headers, and answer key explanations** must be in ${language} (if it is the standard instruction language for this region).

                    **INSTRUCTIONS:**
                    1.  **LISTENING SECTION:**
                        - First, create a short, clear audio script suitable for a grade ${config.grade} student.
                        - Then, based on the script, create a mix of multiple-choice, true/false, and short-answer questions.
                    2.  **READING SECTION:**
                        - Write a reading passage appropriate for the grade level, drawing from topics in the textbook.
                        - Create a mix of multiple-choice, true/false, and short-answer questions based on the passage.
                    3.  **WRITING SECTION:**
                        - Create tasks that test vocabulary and grammar from the textbook.
                    4.  **ANSWERS:** Provide a clear answer key at the very end of the exam.

                    **CRITICAL OUTPUT FORMAT:**
                    Your entire response MUST be a single, valid JSON object.
                    This object must have three keys:
                    1.  \`listeningScript\`: A string containing ONLY the text for the audio passage.
                    2.  \`examMarkdown\`: A string containing the full exam in Markdown format.
                    3.  \`examWordContent\`: A string containing the same exam content as examMarkdown.

                    Do not include any text, explanations, or markdown formatting (like \`\`\`json\`) outside of this single JSON object.
                `;
                
                const responseSchema = {
                    type: Type.OBJECT,
                    properties: {
                        listeningScript: { type: Type.STRING },
                        examMarkdown: { type: Type.STRING },
                        examWordContent: { type: Type.STRING }
                    },
                    required: ['listeningScript', 'examMarkdown', 'examWordContent']
                };
                
                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-pro',
                    contents: prompt,
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
                
                setGeneratedExam(result.examMarkdown || 'Failed to generate exam content.');
                setWordContent(result.examWordContent || '');
                setIsLoading(false);

                if (result.listeningScript) {
                    setIsAudioLoading(true);
                    try {
                        const ttsResponse = await ai.models.generateContent({
                            model: "gemini-2.5-flash-preview-tts",
                            contents: [{ parts: [{ text: result.listeningScript }] }],
                            config: {
                                responseModalities: [Modality.AUDIO],
                                speechConfig: {
                                    voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
                                },
                            },
                        });
                        const base64Audio = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
                        if (base64Audio) {
                            setGeneratedAudio(base64Audio);
                        } else {
                            throw new Error("No audio data received from TTS API.");
                        }
                    } catch (ttsError) {
                        console.error("TTS Error:", ttsError);
                        setGeneratedExam(prev => `**[NOTE: Audio generation failed. Please use the listening script below for the questions.]**\n\n**Listening Script:**\n*${result.listeningScript}*\n\n---\n\n${prev}`);
                    } finally {
                        setIsAudioLoading(false);
                    }
                }
                return; // Exit here for the special case
            }


            // Existing Logic for other subjects/topics
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

            const totalMC = config.numMultipleChoice;

            let mcPromptPart = '';
            if (Number(totalMC) > 0) {
                mcPromptPart = `
**Multiple Choice Section Details:**
-   Total Questions: ${totalMC}
-   Breakdown by Difficulty:
    -   ${t('recognition')}: ${config.mcCounts.recognition} questions
    -   ${t('comprehension')}: ${config.mcCounts.comprehension} questions
    -   ${t('application')}: ${config.mcCounts.application} questions
`;
            }
    
            let essayPromptPart = '';
            if (Number(totalEssay) > 0) {
                essayPromptPart = `
**Essay Section Details:**
-   Total Questions: ${totalEssay}
-   Breakdown by Difficulty:
    -   ${t('recognition')}: ${config.essayCounts.recognition} questions
    -   ${t('comprehension')}: ${config.essayCounts.comprehension} questions
    -   ${t('application')}: ${config.essayCounts.application} questions
`;
            }
    
            let structureInstruction = '';
            const sections = [];
            if (Number(totalMC) > 0) sections.push(`"I. ${t('multiple_choice').toUpperCase()}"`);
            if (Number(totalEssay) > 0) sections.push(`"${Number(totalMC) > 0 ? 'II' : 'I'}. ${t('essay').toUpperCase()}"`);
    
            if (sections.length > 0) {
                structureInstruction = `**Structure:** Create the following distinct section(s): ${sections.join(' and ')}.`;
            } else {
                structureInstruction = `**Structure:** Format the output as a clean document.`;
            }

            let subjectForPrompt = t(config.subject);
            if (config.subject === Subject.NATURAL_SCIENCES && selectedNaturalSciences.length > 0) {
                const subSubjects = selectedNaturalSciences.map(s => t(s)).join(' & ');
                subjectForPrompt = `${t(Subject.NATURAL_SCIENCES)} (focusing on: ${subSubjects})`;
            }

            let prompt = '';
            
            const basePrompt = `
                **CRITICAL LANGUAGE RULE (MUST FOLLOW):**
                The user has explicitly selected **${language}** as their interface language.
                - Your entire response, including all questions, options, instructions, headers (like 'Solution', 'Part I'), and answers, **MUST be in ${language}**. 
                - **Do not output English text unless ${language} is explicitly English.**
                - If the topic or input is in another language, you MUST translate everything to **${language}**.

                **LaTeX for Math**: This is your most important formatting rule. You MUST use LaTeX for ALL mathematical content.
                    - Use \`$...$\` for inline math (e.g., \`$x^2 + 5 = 10$\`).
                    - Use \`$$...$$\` for block-level equations.
                    - **DO NOT** output math as plain text. For example, write \`$\\vec{AB}$\`, NOT \`vector AB\`. Write \`$H_2SO_4$\`, NOT \`H2SO4\`.
                    - Failure to use LaTeX for all math content is a critical error.
                
                **CRITICAL OUTPUT FORMAT:**
                Your entire response MUST be a single, valid JSON object in ${language}.
                This object MUST have two keys:
                1.  \`markdownContent\`: The content formatted with Markdown and LaTeX for web display.
                2.  \`wordContent\`: The same content, but with all LaTeX converted to Microsoft Word's native Equation format (UnicodeMath) for direct copy-pasting.

                Do not include any text, explanations, or markdown formatting outside of this JSON object.
            `;
            
            if (userRole === UserRole.STUDENT) {
                 prompt = `
                    Act as an expert ${subjectForPrompt} tutor. Your task is to create a set of practice exercises for a grade ${config.grade} student.

                    **Review Details:**
                    -   Topic: "${config.topic}"
                    ${textbookName ? `-   Textbook: "${textbookName}"` : ''}

                    ${mcPromptPart}
                    ${essayPromptPart}
                    
                    ${basePrompt}

                    **Other Instructions:**
                    -   **Content:** Questions must be relevant and grade-appropriate for reviewing the topic.
                    -   **Difficulty Distribution:** Strictly follow the specified question counts for all sections.
                    ${textbookName ? `-   **Textbook Adherence:** Strictly follow the curriculum from the specified textbook.` : ''}
                    -   ${structureInstruction}
                    -   **Formatting:** Format the \`markdownContent\` in clean Markdown.
                    -   **Multiple Choice:** If you generate a multiple choice section, you must provide 4 options (A, B, C, D) for each question and clearly indicate the correct answer.

                    Now, generate the review exercises based on these absolute rules.
                `;
            } else {
                prompt = `
                    Act as an expert ${subjectForPrompt} teacher. Your task is to create a well-structured exam for a grade ${config.grade} student.
    
                    **Exam Details:**
                    -   Topic: "${config.topic}"
                    -   Duration: ${config.duration} minutes
                    ${textbookName ? `-   Textbook: "${textbookName}"` : ''}
    
                    ${mcPromptPart}
                    ${essayPromptPart}
    
                    ${basePrompt}
    
                    **Other Instructions:**
                    -   **Content:** Questions must be relevant, grade-appropriate, and suitable for the specified duration.
                    -   **Difficulty Distribution:** Strictly follow the specified question counts for all sections.
                    ${textbookName ? `-   **Textbook Adherence:** Strictly follow the curriculum from the specified textbook.` : ''}
                    ${matrixFile ? `-   **Matrix Adherence:** Strictly follow the structure from the provided matrix file.` : ''}
                    -   ${structureInstruction}
                    -   **Formatting:** Format the \`markdownContent\` in clean Markdown.
                    -   **Multiple Choice:** If you generate a multiple choice section, you must provide 4 options (A, B, C, D) for each question and clearly indicate the correct answer.
    
                    Now, generate the exam based on these absolute rules.
                `;
            }
            
            if (userRole === UserRole.TEACHER && matrixFile) {
                parts.push(await fileToGenerativePart(matrixFile));
            }

            parts.push({ text: prompt });

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
            setGeneratedExam(result.markdownContent || '');
            setWordContent(result.wordContent || '');


        } catch (e) {
            console.error("Error generating exam:", e);
            setError("Sorry, an error occurred while generating the exam. Please try again.");
        } finally {
            setIsLoading(false);
            setIsAudioLoading(false);
        }
    };
    
    const handleSave = () => {
        if (!generatedExam.trim() || !config.topic.trim()) return;

        const isStudent = userRole === UserRole.STUDENT;
        const itemType = isStudent ? LibraryItemType.REVIEW_EXERCISES : LibraryItemType.EXAM;
        const name = `${t(itemType)}: ${config.topic}`;
        
        addToLibrary({
            name,
            type: itemType,
            content: generatedExam,
        });

        setSaveButtonText(t('saved'));
        setTimeout(() => resetSaveButton(), 2000);
    };

    const handleCopyAsText = () => {
        if (!generatedExam) return;

        const plainText = generatedExam
            .replace(/## /g, '\n')
            .replace(/### /g, '')
            .replace(/\$\$(.*?)\$\$/g, '$1')
            .replace(/\$(.*?)\$/g, '$1')
            .replace(/\*\*(.*?)\*\*/g, '$1')
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

    const handlePlayAudio = async () => {
        if (!generatedAudio || isSpeaking) return;
        setIsSpeaking(true);

        try {
            const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            const audioBuffer = await decodeAudioData(
                decode(generatedAudio),
                outputAudioContext,
                24000,
                1,
            );
            const source = outputAudioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(outputAudioContext.destination);
            source.start();
            source.onended = () => {
                setIsSpeaking(false);
                outputAudioContext.close();
            };

        } catch (e) {
            console.error("Audio playback error:", e);
            setIsSpeaking(false);
        }
    };
    
    const totalEssayQuestions = Object.values(config.essayCounts).reduce((sum: number, count: number) => sum + count, 0);
    const totalMcByDifficulty = Object.values(config.mcCounts).reduce((sum: number, count: number) => sum + count, 0);
    const isMcCountMismatch = totalMcByDifficulty !== Number(config.numMultipleChoice);


    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Configuration Section */}
            <div className="lg:col-span-1 bg-white/80 backdrop-blur-sm border border-slate-200 shadow-sm p-6 rounded-2xl space-y-4">
                <h3 className="text-xl font-semibold text-slate-900 mb-4">{userRole === UserRole.STUDENT ? t('review_exercises') : t('exam_generator')}</h3>
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
                            {examGeneratorSubjects.map(s => <option key={s} value={s}>{t(s)}</option>)}
                        </select>
                    </div>
                </div>
                {config.subject === Subject.NATURAL_SCIENCES && (
                     <div>
                        <label className="block text-sm font-medium text-slate-600 mb-2">{t('sub_subjects')}</label>
                        <div className="flex flex-wrap gap-2">
                            {naturalScienceSubSubjects.map(sub => (
                                <button
                                    key={sub}
                                    type="button"
                                    onClick={() => handleNaturalScienceChange(sub)}
                                    className={`px-3 py-1.5 text-sm font-medium rounded-full transition-all duration-200 ${
                                        selectedNaturalSciences.includes(sub)
                                        ? 'bg-indigo-600 text-white shadow-md'
                                        : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                                    }`}
                                >
                                    {t(sub)}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                <div>
                    <label className="block text-sm font-medium text-slate-600">{userRole === UserRole.STUDENT ? t('review_topic') : t('exam_topic')}</label>
                    <input name="topic" type="text" value={config.topic} onChange={handleConfigChange} placeholder={t('topic_placeholder')} className="mt-1 w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 transition" />
                </div>
                 <div>
                    <label className="block text-sm font-medium text-slate-600">{t('textbook')}</label>
                    <select name="textbook" value={config.textbook} onChange={handleConfigChange} className="mt-1 w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 transition">
                        {TEXTBOOKS.map(tb => <option key={tb} value={tb}>{t(tb)}</option>)}
                    </select>
                    {config.textbook === 'other' && (
                        <input
                            name="manualTextbook"
                            type="text"
                            value={manualTextbook}
                            onChange={(e) => setManualTextbook(e.target.value)}
                            placeholder={t('manual_textbook_placeholder')}
                            className="mt-2 w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 transition"
                        />
                    )}
                </div>
                {userRole === UserRole.TEACHER && (
                    <div>
                        <label className="block text-sm font-medium text-slate-600">{t('exam_duration')}</label>
                        <input name="duration" type="number" value={config.duration} onChange={handleConfigChange} min="1" max="180" className="mt-1 w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 transition" />
                    </div>
                )}
                
                {/* Multiple Choice Config */}
                <div>
                    <label className="block text-sm font-medium text-slate-600">{t('num_multiple_choice')}</label>
                    <input name="numMultipleChoice" type="number" value={config.numMultipleChoice} onChange={handleConfigChange} min="0" max="50" className="mt-1 w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 transition" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-600">{t('mc_difficulty_breakdown')}</label>
                     {isMcCountMismatch && (
                        <p className="text-xs text-red-500 mt-1">{t('mc_sum_error')} ({totalMcByDifficulty}/{config.numMultipleChoice})</p>
                    )}
                    <div className="mt-2 grid grid-cols-3 gap-3">
                        {DIFFICULTY_LEVELS.map(level => (
                            <div key={level}>
                                <label htmlFor={`numMc-${level}`} className="block text-xs font-medium text-slate-500 text-center mb-1">{t(level)}</label>
                                <input 
                                    id={`numMc-${level}`}
                                    name={`numMc-${level}`}
                                    type="number"
                                    value={config.mcCounts[level]}
                                    onChange={(e) => handleMcCountChange(level, e.target.value)}
                                    min="0" max={config.numMultipleChoice} 
                                    className={`w-full text-center p-2 bg-slate-50 border rounded-lg focus:ring-2 focus:ring-indigo-500 transition ${isMcCountMismatch ? 'border-red-500' : 'border-slate-300'}`} 
                                />
                            </div>
                        ))}
                    </div>
                </div>


                {/* Essay Config */}
                <div>
                    <label className="block text-sm font-medium text-slate-600">{t('num_essay')}</label>
                    <div className="mt-2 grid grid-cols-3 gap-3">
                        {DIFFICULTY_LEVELS.map(level => (
                            <div key={level}>
                                <label htmlFor={`numEssay-${level}`} className="block text-xs font-medium text-slate-500 text-center mb-1">{t(level)}</label>
                                <input 
                                    id={`numEssay-${level}`}
                                    name={`numEssay-${level}`}
                                    type="number"
                                    value={config.essayCounts[level]}
                                    onChange={(e) => handleEssayCountChange(level, e.target.value)}
                                    min="0" max="10" 
                                    className="w-full text-center p-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 transition" 
                                />
                            </div>
                        ))}
                    </div>
                </div>

                {userRole === UserRole.TEACHER && (
                    <div>
                        <label className="block text-sm font-medium text-slate-600">{t('upload_matrix')} (Optional)</label>
                         <div className="flex items-center gap-3 mt-1">
                             <input 
                                ref={matrixInputRef}
                                type="file" 
                                onChange={handleMatrixFileChange} 
                                accept="image/*,.pdf" 
                                className="hidden"
                            />
                            <button 
                                onClick={() => matrixInputRef.current?.click()}
                                className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors text-sm font-medium"
                            >
                                {t('choose_file')}
                            </button>
                            <span className="text-sm text-slate-500 truncate flex-1">
                                {matrixFileName || t('no_file_chosen')}
                            </span>
                        </div>
                    </div>
                )}
                <button onClick={handleGenerate} disabled={isLoading || !config.topic.trim() || (config.numMultipleChoice === 0 && totalEssayQuestions === 0) || isMcCountMismatch || (config.subject === Subject.NATURAL_SCIENCES && selectedNaturalSciences.length === 0)} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold py-3 px-4 rounded-lg hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 transition-all duration-300 transform hover:scale-105 mt-4">
                    {isLoading ? t('generating') : (userRole === UserRole.STUDENT ? t('generate_review_exercises') : t('generate_exam'))}
                </button>
                 <div className="flex flex-col sm:flex-row items-center gap-2 mt-2">
                    {generatedExam && !isLoading && (
                        <>
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
                           <button 
                              onClick={handleSave} 
                              className="w-full sm:w-auto bg-gradient-to-r from-sky-600 to-cyan-600 text-white font-bold py-3 px-4 rounded-lg hover:from-sky-700 hover:to-cyan-700 transition-all duration-300 transform hover:scale-105">
                              {saveButtonText}
                           </button>
                        </>
                    )}
                 </div>
            </div>
            {/* Output Section */}
            <div className="lg:col-span-2 bg-white/80 backdrop-blur-sm border border-slate-200 shadow-sm p-2 rounded-2xl min-h-[600px] flex flex-col">
                 {isLoading ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-indigo-500"></div>
                    </div>
                ) : error ? (
                    <div className="flex items-center justify-center h-full text-red-600 p-4 text-center">{error}</div>
                ) : (
                    <div className="h-full flex-1 flex flex-col">
                        {(isAudioLoading || generatedAudio) && (
                            <div className="p-4 border-b border-slate-200 bg-slate-50 rounded-t-lg flex-shrink-0">
                                {isAudioLoading ? (
                                    <div className="flex items-center justify-center text-sm text-slate-600">
                                        <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-indigo-500 mr-3"></div>
                                        {t('generating')} audio...
                                    </div>
                                ) : generatedAudio && (
                                     <button onClick={handlePlayAudio} disabled={isSpeaking} className="w-full flex items-center justify-center gap-3 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-wait transition-colors">
                                        {isSpeaking ? (
                                             <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M5 4a1 1 0 00-2 0v12a1 1 0 002 0V4zM15 4a1 1 0 00-2 0v12a1 1 0 002 0V4z" /></svg>
                                        ) : (
                                            <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" /></svg>
                                        )}
                                        <span>{isSpeaking ? "Playing..." : "Play Listening Passage"}</span>
                                    </button>
                                )}
                            </div>
                        )}
                        <div className="flex-1 h-0 overflow-y-auto bg-white rounded-b-lg custom-scrollbar">
                           <MarkdownRenderer markdown={generatedExam} placeholder={userRole === UserRole.STUDENT ? t('review_placeholder') : t('exam_placeholder')} />
                       </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ExamGenerator;

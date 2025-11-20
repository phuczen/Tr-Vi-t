
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Chat, GenerateContentResponse, Part } from '@google/genai';
import { useApp } from '../App';
import { ChatMessage, ChatFile, Dialect, Language } from '../types';
import MarkdownRenderer from './MarkdownRenderer';
import { TEXTBOOKS } from '../constants';

// Add this interface for compatibility
declare global {
    interface Window {
        SpeechRecognition: any;
        webkitSpeechRecognition: any;
    }
}

// Define the SpeechRecognition interface to resolve the type error.
interface SpeechRecognition {
    lang: string;
    interimResults: boolean;
    continuous: boolean;
    onresult: (event: any) => void;
    onerror: (event: any) => void;
    onstart: () => void;
    onend: () => void;
    start: () => void;
    stop: () => void;
    abort: () => void;
}

const Chatbot: React.FC = () => {
    const { t, language } = useApp();
    const [chat, setChat] = useState<Chat | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [textbook, setTextbook] = useState('none');
    const [manualTextbook, setManualTextbook] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [attachedFile, setAttachedFile] = useState<File | null>(null);
    const [dialect, setDialect] = useState<Dialect>(Dialect.NORTH);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // New state for voice input
    const [isRecording, setIsRecording] = useState(false);
    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const [voiceSupported, setVoiceSupported] = useState(false);


    // Initialize or re-initialize chat when dialect or language changes
    useEffect(() => {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        let dialectInstruction = '';
        if (language === Language.VI) {
            switch (dialect) {
                case Dialect.NORTH:
                    dialectInstruction = 'Your Vietnamese responses should use a natural Northern accent.';
                    break;
                case Dialect.CENTRAL:
                    dialectInstruction = 'Your Vietnamese responses should use a natural Central accent, including characteristic regional words.';
                    break;
                case Dialect.SOUTH:
                    dialectInstruction = 'Your Vietnamese responses should use a friendly and natural Southern accent.';
                    break;
            }
        }

        const systemInstruction = `
            You are an expert AI assistant for teachers. Your primary goal is to be friendly, creative, fast, and accurate in helping with lesson planning, creating materials, and brainstorming ideas.
            
            **CRITICAL LANGUAGE RULE (MUST FOLLOW):**
            The user has explicitly selected **${language}** as their interface language.
            - You MUST respond exclusively in **${language}**.
            - **Do not use any other language unless specifically asked to translate.** 
            - Even if the user's input is in a different language (e.g., English), your response MUST be in **${language}**.
            ${dialectInstruction}

            **LaTeX for Math**: This is your most critical formatting rule. When the conversation involves mathematics, physics, or any scientific formula, you MUST use LaTeX for ALL mathematical expressions, variables, and symbols.
                - Use \`$...$\` for inline math.
                - Use \`$$...$$\` for block equations.
                - **Example**: \`$x^2 + y^2 = z^2$\`, NOT \`x^2 + y^2 = z^2\`.
                - For all other subjects and general conversation, you MUST respond in plain, natural language and SHOULD NOT use LaTeX.
            
            - Base your answers on the textbook specified by the user. If no textbook is provided, use your knowledge of standard curriculum.
            - Analyze any files (images, audio, video) provided by the user in the context of their request.
        `;


        const newChat = ai.chats.create({
            model: 'gemini-2.5-flash',
            config: {
                systemInstruction,
            },
        });
        setChat(newChat);

        const initialMessage: ChatMessage = {
            role: 'model',
            text: t('teacher_chatbot_greeting')
        };
        setMessages([initialMessage]);
    }, [language, t, dialect]);
    
    // Setup for SpeechRecognition API
    useEffect(() => {
        const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognitionAPI) {
            console.warn("Speech recognition not supported by this browser.");
            setVoiceSupported(false);
            return;
        }
        setVoiceSupported(true);

        const recognition = new SpeechRecognitionAPI();
        recognitionRef.current = recognition;

        let langCode = 'en-US';
        if (language === Language.VI) langCode = 'vi-VN';
        if (language === Language.ZH) langCode = 'cmn-Hans-CN';
        if (language === Language.FR) langCode = 'fr-FR';

        recognition.lang = langCode;
        recognition.interimResults = false;
        recognition.continuous = false;

        recognition.onresult = (event: any) => {
            const transcript = event.results[event.results.length - 1][0].transcript.trim();
            setInput(prev => prev ? `${prev} ${transcript}` : transcript);
        };

        recognition.onerror = (event: any) => {
            console.error(`Speech recognition error: ${event.error}`);
            setIsRecording(false);
        };

        recognition.onstart = () => {
            setIsRecording(true);
        };

        recognition.onend = () => {
            setIsRecording(false);
        };

        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.abort();
            }
        };
    }, [language]);


    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

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

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setAttachedFile(file);
        }
    };

    const handleSend = async () => {
        if ((!input.trim() && !attachedFile) || !chat || isLoading) return;

        const parts: Part[] = [];
        let userMessageFile: ChatFile | undefined = undefined;
        
        if (attachedFile) {
            const filePart = await fileToGenerativePart(attachedFile);
            parts.push(filePart);
             userMessageFile = {
                base64Data: filePart.inlineData.data,
                mimeType: attachedFile.type,
                name: attachedFile.name,
            };
        }
        
        const textbookName = textbook === 'other' ? manualTextbook : (textbook !== 'none' ? t(textbook) : '');
        let fullInputText = input;
        if (textbookName.trim()) {
            fullInputText = `Textbook context: "${textbookName}".\n\nUser request: "${input}"`;
        }


        if (fullInputText.trim()) {
            parts.push({ text: fullInputText });
        } else if (parts.length === 0) { // Don't send if only textbook is filled but no text/file
            return;
        }

        const userMessage: ChatMessage = { role: 'user', text: input, file: userMessageFile };
        setMessages(prev => [...prev, userMessage]);
        
        setInput('');
        setAttachedFile(null);
        setIsLoading(true);

        try {
            const result: GenerateContentResponse = await chat.sendMessage({ message: parts });
            const modelMessage: ChatMessage = { role: 'model', text: result.text || "Sorry, I couldn't process that." };
            setMessages(prev => [...prev, modelMessage]);
        } catch (error) {
            console.error("Chat error:", error);
            const errorMessage: ChatMessage = { role: 'model', text: "Sorry, an error occurred. Please try again." };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // New handler for microphone button
    const handleMicClick = () => {
        if (!voiceSupported || isLoading) return;

        if (isRecording) {
            recognitionRef.current?.stop();
        } else {
            recognitionRef.current?.start();
        }
    };
    
    const DialectButton: React.FC<{ targetDialect: Dialect, label: string }> = ({ targetDialect, label }) => (
      <button 
        onClick={() => setDialect(targetDialect)}
        className={`px-4 py-1.5 text-sm rounded-full transition-all duration-200 ${dialect === targetDialect ? 'bg-indigo-600 text-white font-semibold shadow-md' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}
      >
        {label}
      </button>
    );

    return (
        <div className="flex flex-col h-[75vh] bg-white/80 backdrop-blur-sm border border-slate-200 shadow-sm rounded-2xl">
            {language === Language.VI && (
                <div className="px-4 py-3 border-b border-slate-200 bg-white/60 rounded-t-2xl">
                    <label className="text-xs text-slate-500 mb-2 block font-medium">{t('select_dialect')}</label>
                    <div className="flex items-center space-x-3">
                        <DialectButton targetDialect={Dialect.NORTH} label={t('north')} />
                        <DialectButton targetDialect={Dialect.CENTRAL} label={t('central')} />
                        <DialectButton targetDialect={Dialect.SOUTH} label={t('south')} />
                    </div>
                </div>
            )}
            <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
                {messages.map((msg, index) => (
                    <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} mb-4`}>
                        <div className={`max-w-xl p-3 rounded-xl ${msg.role === 'user' ? 'bg-white shadow-sm border border-slate-200' : 'bg-slate-200'}`}>
                             {msg.file && (
                                <div className="mb-2">
                                    {msg.file.mimeType.startsWith('image/') && (
                                        <img src={`data:${msg.file.mimeType};base64,${msg.file.base64Data}`} alt={msg.file.name} className="rounded-lg max-h-60" />
                                    )}
                                    {msg.file.mimeType.startsWith('audio/') && (
                                        <audio controls src={`data:${msg.file.mimeType};base64,${msg.file.base64Data}`} />
                                    )}
                                    {msg.file.mimeType.startsWith('video/') && (
                                        <video controls src={`data:${msg.file.mimeType};base64,${msg.file.base64Data}`} className="rounded-lg max-h-60" />
                                    )}
                                    <p className="text-xs italic mt-1 text-slate-500 opacity-80">{msg.file.name}</p>
                                </div>
                            )}
                             <MarkdownRenderer markdown={msg.text} placeholder="" />
                        </div>
                    </div>
                ))}
                 {isLoading && (
                    <div className="flex justify-start mb-4">
                        <div className="max-w-xl p-3 rounded-xl bg-slate-200">
                           <div className="flex items-center space-x-2">
                                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse [animation-delay:-0.3s]"></div>
                                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse [animation-delay:-0.15s]"></div>
                                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse"></div>
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>
            <div className="p-4 border-t border-slate-200">
                 {attachedFile && (
                    <div className="flex items-center justify-between bg-slate-200/70 px-3 py-2 rounded-t-lg text-sm">
                        <span className="text-slate-700 truncate">{t('file_attached')} <span className="font-medium">{attachedFile.name}</span></span>
                        <button onClick={() => setAttachedFile(null)} title={t('remove_file')} className="text-slate-500 hover:text-red-500 transition-colors">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                        </button>
                    </div>
                )}
                <div className="mb-2">
                    <label className="block text-xs font-medium text-slate-500 mb-1">{t('textbook')}</label>
                    <select
                        value={textbook}
                        onChange={(e) => {
                            setTextbook(e.target.value);
                            if (e.target.value !== 'other') {
                                setManualTextbook('');
                            }
                        }}
                        className="w-full text-sm p-2 bg-slate-100 border border-slate-300 rounded-lg focus:ring-1 focus:ring-indigo-500 transition"
                        disabled={isLoading}
                    >
                        {TEXTBOOKS.map(tb => <option key={tb} value={tb}>{t(tb)}</option>)}
                    </select>
                    {textbook === 'other' && (
                        <input
                            type="text"
                            value={manualTextbook}
                            onChange={(e) => setManualTextbook(e.target.value)}
                            placeholder={t('manual_textbook_placeholder')}
                            className="mt-2 w-full text-sm p-2 bg-slate-100 border border-slate-300 rounded-lg focus:ring-1 focus:ring-indigo-500 transition"
                            disabled={isLoading}
                        />
                    )}
                </div>
                <div className="flex items-center space-x-2">
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*,audio/*,video/*" />
                    <button onClick={() => fileInputRef.current?.click()} title={t('attach_file')} disabled={isLoading} className="bg-slate-200 text-slate-700 p-3 rounded-lg hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                    </button>
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder={t('teacher_chatbot_placeholder')}
                        className={`flex-1 p-3 bg-white border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition rounded-lg`}
                        disabled={isLoading}
                    />
                    <button
                        onClick={handleMicClick}
                        title={voiceSupported ? (isRecording ? t('stop_recording') : t('start_recording')) : t('voice_unsupported')}
                        disabled={!voiceSupported || isLoading}
                        className={`p-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isRecording ? 'bg-red-600 text-white animate-pulse' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}
                        type="button"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                    </button>
                    <button onClick={handleSend} disabled={isLoading || (!input.trim() && !attachedFile)} className="bg-indigo-600 text-white p-3 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Chatbot;

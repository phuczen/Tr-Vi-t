import React, { useState } from 'react';
import { useApp } from '../App';
import { UserRole } from '../types';
import Summarizer from './Summarizer';
import ExamGenerator from './ExamGenerator';
import Chatbot from './Chatbot';
import Translator from './Translator';
import SlideGenerator from './SlideGenerator';
import LearningPath from './LearningPath';
import QuestionAnalysis from './QuestionAnalysis';
import Library from './Library';


const MainLayout: React.FC = () => {
    const { t, userRole, studentGoal, handleGoHome } = useApp();

    const studentFeatures = ['learning_path', 'summarizer', 'exam_generator', 'question_analysis', 'translator', 'library'];
    const teacherFeatures = ['ai_assistant', 'exam_generator', 'slide_generator', 'summarizer', 'question_analysis', 'translator', 'library'];

    const availableFeatures = userRole === UserRole.STUDENT ? studentFeatures : teacherFeatures;
    
    const [activeTab, setActiveTab] = useState(availableFeatures[0]);

    const renderContent = () => {
        switch (activeTab) {
            case 'summarizer': return <Summarizer />;
            case 'exam_generator': return <ExamGenerator />;
            case 'ai_assistant': return <Chatbot />;
            case 'translator': return <Translator />;
            case 'slide_generator': return <SlideGenerator />;
            case 'learning_path': return <LearningPath />;
            case 'question_analysis': return <QuestionAnalysis />;
            case 'library': return <Library />;
            default: return null;
        }
    };

    const NavButton: React.FC<{ tab: string }> = ({ tab }) => {
        let buttonText = t(tab);
        if (userRole === UserRole.STUDENT && tab === 'exam_generator') {
            buttonText = t('review_exercises');
        }
        if (tab === 'library') {
            buttonText = userRole === UserRole.TEACHER ? t('documents') : t('library');
        }

        return (
            <button
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors duration-200 ${
                    activeTab === tab 
                    ? 'bg-slate-200/50 text-indigo-600 border-b-2 border-indigo-500' 
                    : 'text-slate-500 hover:text-slate-900'
                }`}
            >
                {buttonText}
            </button>
        );
    };

    return (
        <div className="flex flex-col min-h-screen bg-transparent text-slate-800 p-4 sm:p-6 lg:p-8">
            <header className="mb-6 flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600">Trí Việt</h1>
                    <button
                        onClick={handleGoHome}
                        title={t('go_home')}
                        aria-label={t('go_home')}
                        className="p-2 rounded-full text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                        </svg>
                    </button>
                </div>
                 <div className="text-right text-slate-600 text-sm">
                    <p>{t(userRole)}</p>
                    {userRole === UserRole.STUDENT && <p>{t('select_goal')}: <span className="font-bold text-indigo-600">{t(studentGoal!)}</span></p>}
                </div>
            </header>
            
            <nav className="border-b border-slate-200 mb-6 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8">
                <div className="flex flex-wrap -mb-px">
                   {availableFeatures.map(tab => <NavButton key={tab} tab={tab} />)}
                </div>
            </nav>
            
            <main className="flex-grow">
                {renderContent()}
            </main>
        </div>
    );
};

export default MainLayout;
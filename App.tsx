import React, { useState, createContext, useContext, useEffect } from 'react';
import { Language, UserRole, StudentGoal, LibraryItem } from './types';
import { LOCALIZATION_STRINGS, STORAGE_LIMIT_BYTES } from './constants';
import SplashScreen from './components/SplashScreen';
import MainLayout from './components/MainLayout';
import RoleSelectionScreen from './components/RoleSelectionScreen';
import GoalSelectionScreen from './components/GoalSelectionScreen';

interface AppContextType {
  language: Language;
  userRole: UserRole;
  studentGoal: StudentGoal | null;
  t: (key: string) => string;
  handleGoHome: () => void;
  library: LibraryItem[];
  addToLibrary: (item: Omit<LibraryItem, 'id' | 'timestamp'>) => void;
  removeFromLibrary: (id: string) => void;
  libraryUsage: { used: number; total: number };
}

export const AppContext = createContext<AppContextType | null>(null);

export const useApp = (): AppContextType => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

const App: React.FC = () => {
  const [language, setLanguage] = useState<Language | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [studentGoal, setStudentGoal] = useState<StudentGoal | null>(null);

  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [libraryUsage, setLibraryUsage] = useState({ used: 0, total: STORAGE_LIMIT_BYTES });

  const t = (key: string): string => {
    // Fallback to English if language is not set yet, for early components
    const lang = language || Language.EN;
    return LOCALIZATION_STRINGS[lang]?.[key] || LOCALIZATION_STRINGS[Language.EN][key] || key;
  };
  
  const getLibraryStorageKey = (): string | null => {
      if (!userRole) return null;
      return `triVietLibrary_${userRole}`;
  }

  // Effect to load library from localStorage when userRole changes
  useEffect(() => {
    const key = getLibraryStorageKey();
    if (!key) return;
    
    const savedData = localStorage.getItem(key);
    if (savedData) {
        try {
            const items: LibraryItem[] = JSON.parse(savedData);
            setLibrary(items);
            const used = new TextEncoder().encode(savedData).length;
            setLibraryUsage({ used, total: STORAGE_LIMIT_BYTES });
        } catch (e) {
            console.error('Failed to parse library data', e);
            setLibrary([]);
            setLibraryUsage({ used: 0, total: STORAGE_LIMIT_BYTES });
        }
    } else {
        setLibrary([]);
        setLibraryUsage({ used: 0, total: STORAGE_LIMIT_BYTES });
    }
  }, [userRole]);


  const handleLanguageSelect = (selectedLanguage: Language) => {
    setLanguage(selectedLanguage);
  };

  const handleRoleSelect = (selectedRole: UserRole) => {
    setUserRole(selectedRole);
  };

  const handleGoalSelect = (selectedGoal: StudentGoal) => {
    setStudentGoal(selectedGoal);
  };

  const handleGoHome = () => {
    setLanguage(null);
    setUserRole(null);
    setStudentGoal(null);
  };

  const addToLibrary = (itemData: Omit<LibraryItem, 'id' | 'timestamp'>) => {
      const key = getLibraryStorageKey();
      if (!key) return;

      const newItem: LibraryItem = {
          ...itemData,
          id: `${Date.now()}`,
          timestamp: Date.now(),
      };
      
      const updatedLibrary = [newItem, ...library];
      const newLibraryString = JSON.stringify(updatedLibrary);
      const newSize = new TextEncoder().encode(newLibraryString).length;

      if (newSize > STORAGE_LIMIT_BYTES) {
          alert(t('storage_full'));
          return;
      }
      
      localStorage.setItem(key, newLibraryString);
      setLibrary(updatedLibrary);
      setLibraryUsage({ used: newSize, total: STORAGE_LIMIT_BYTES });
  };

  const removeFromLibrary = (id: string) => {
      const key = getLibraryStorageKey();
      if (!key) return;

      const updatedLibrary = library.filter(item => item.id !== id);
      const newLibraryString = JSON.stringify(updatedLibrary);
      const newSize = new TextEncoder().encode(newLibraryString).length;

      localStorage.setItem(key, newLibraryString);
      setLibrary(updatedLibrary);
      setLibraryUsage({ used: newSize, total: STORAGE_LIMIT_BYTES });
  };


  if (!language) {
    return <SplashScreen onLanguageSelect={handleLanguageSelect} />;
  }
  
  if (!userRole) {
    return <RoleSelectionScreen onRoleSelect={handleRoleSelect} language={language} />;
  }

  if (userRole === UserRole.STUDENT && !studentGoal) {
    return <GoalSelectionScreen onGoalSelect={handleGoalSelect} language={language} />;
  }


  return (
    <AppContext.Provider value={{ language, userRole, studentGoal, t, handleGoHome, library, addToLibrary, removeFromLibrary, libraryUsage }}>
      <MainLayout />
    </AppContext.Provider>
  );
};

export default App;
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  defaultLanguage,
  isLanguageCode,
  type LanguageCode,
} from "@/lib/i18n/languages";

// This key is the name we use to save the selected language in the browser.
// The saved value will be either "en" or "nl".
const languageStorageKey = "voya-taxi-language";

// LanguageContextValue describes the data that our language context provides.
// Components can read the current language and change it through setLanguageCode.
type LanguageContextValue = {
  languageCode: LanguageCode;
  setLanguageCode: (nextLanguageCode: LanguageCode) => void;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(
  undefined,
);

// LanguageProviderProps describes what props the LanguageProvider accepts.
// children means: all components inside this provider.
type LanguageProviderProps = {
  children: ReactNode;
};

// Reads the saved language when the component starts.
// We use this function as the initial value for useState.
// This avoids calling setState directly inside useEffect.
function getInitialLanguageCode(): LanguageCode {
  if (typeof window === "undefined") {
    return defaultLanguage;
  }

  const savedLanguageCode = window.localStorage.getItem(languageStorageKey);

  if (savedLanguageCode && isLanguageCode(savedLanguageCode)) {
    return savedLanguageCode;
  }

  return defaultLanguage;
}

// LanguageProvider makes the selected language available to other components.
// Later, public pages can use this provider to show English or Dutch text.
export function LanguageProvider({ children }: LanguageProviderProps) {
  const [languageCode, setLanguageCodeState] = useState<LanguageCode>(
    getInitialLanguageCode,
  );

  // Changes the language in React state and saves it in the browser.
  // useCallback keeps this function stable, which helps with useMemo below.
  const setLanguageCode = useCallback((nextLanguageCode: LanguageCode) => {
    setLanguageCodeState(nextLanguageCode);
    window.localStorage.setItem(languageStorageKey, nextLanguageCode);
  }, []);

  // contextValue is the object that will be shared with child components.
  // useMemo prevents creating a new object unless the language actually changes.
  const contextValue = useMemo(
    () => ({
      languageCode,
      setLanguageCode,
    }),
    [languageCode, setLanguageCode],
  );

  return (
    <LanguageContext.Provider value={contextValue}>
      {children}
    </LanguageContext.Provider>
  );
}

// useLanguage is a helper hook.
// It lets other components easily read and change the selected language.
export function useLanguage() {
  const contextValue = useContext(LanguageContext);

  if (!contextValue) {
    throw new Error("useLanguage must be used inside LanguageProvider");
  }

  return contextValue;
}
"use client";

/*
  LanguageProvider makes the selected language available to client components.

  Important hydration note:
  The server does not have access to localStorage.

  To prevent a hydration mismatch, the server and first browser render both use
  the default language first. After hydration, React reads localStorage and
  updates the language if the user saved another choice.
*/

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  defaultLanguage,
  getLanguageDirection,
  isLanguageCode,
  type LanguageCode,
} from "@/lib/i18n/languages";

// This key is used to save the selected language in the browser.
const languageStorageKey = "voya-taxi-language";

// This custom event updates the language inside the same browser tab.
// The normal storage event mainly helps when another browser tab changes it.
const languageChangeEventName = "voya-taxi-language-change";

/*
  LanguageContextValue describes the information provided by the language context.

  languageCode:
  The currently selected language.

  setLanguageCode:
  A function that changes and saves the selected language.
*/
type LanguageContextValue = {
  languageCode: LanguageCode;
  setLanguageCode: (nextLanguageCode: LanguageCode) => void;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(
  undefined,
);

/*
  LanguageProviderProps describes the props accepted by LanguageProvider.

  children means all pages and components placed inside the provider.
*/
type LanguageProviderProps = {
  children: ReactNode;
};

// Reads the saved language from localStorage.
// If the saved value is missing or invalid, English is used.
function getStoredLanguageCode(): LanguageCode {
  if (typeof window === "undefined") {
    return defaultLanguage;
  }

  const savedLanguageCode = window.localStorage.getItem(languageStorageKey);

  if (savedLanguageCode && isLanguageCode(savedLanguageCode)) {
    return savedLanguageCode;
  }

  return defaultLanguage;
}

// Used during server rendering and the first hydration render.
// It must return the same initial value on the server and in the browser.
function getServerLanguageCode(): LanguageCode {
  return defaultLanguage;
}

// Tells React when the external language value has changed.
function subscribeToLanguageChanges(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(languageChangeEventName, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(languageChangeEventName, onStoreChange);
  };
}

// Shares the selected language with all child components.
export function LanguageProvider({ children }: LanguageProviderProps) {
  const languageCode = useSyncExternalStore(
    subscribeToLanguageChanges,
    getStoredLanguageCode,
    getServerLanguageCode,
  );

  /*
    Updates the language and writing direction of the complete webpage.

    English and Dutch:
    <html lang="en" dir="ltr">

    Arabic:
    <html lang="ar" dir="rtl">
  */
  useEffect(() => {
    const textDirection = getLanguageDirection(languageCode);

    document.documentElement.lang = languageCode;
    document.documentElement.dir = textDirection;
  }, [languageCode]);

  // Saves the new language and notifies the current browser tab.
  const setLanguageCode = useCallback(
    (nextLanguageCode: LanguageCode) => {
      window.localStorage.setItem(
        languageStorageKey,
        nextLanguageCode,
      );

      window.dispatchEvent(new Event(languageChangeEventName));
    },
    [],
  );

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

// Helper hook for reading and changing the selected language.
export function useLanguage() {
  const contextValue = useContext(LanguageContext);

  if (!contextValue) {
    throw new Error(
      "useLanguage must be used inside LanguageProvider",
    );
  }

  return contextValue;
}


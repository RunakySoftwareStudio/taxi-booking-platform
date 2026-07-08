"use client";

/*
  LanguageProvider makes the selected language available to client components.

  Important hydration note:
  The server does not have access to localStorage.
  To prevent a hydration mismatch, the server and first browser render both use
  the default language first. After hydration, React reads localStorage and
  updates the language if the user saved another choice.
*/

import { createContext, useCallback,  useContext, useMemo, useSyncExternalStore, type ReactNode,} from "react";
import { defaultLanguage, isLanguageCode, type LanguageCode,} from "@/lib/i18n/languages";

// This key is the name we use to save the selected language in the browser.
const languageStorageKey = "voya-taxi-language";

// This custom event updates the language in the same browser tab.
// The normal "storage" event mostly helps when localStorage changes in another tab.
const languageChangeEventName = "voya-taxi-language-change";

// LanguageContextValue describes the data that our language context provides.
type LanguageContextValue = {  languageCode: LanguageCode;  setLanguageCode: (nextLanguageCode: LanguageCode) => void;};
const LanguageContext = createContext<LanguageContextValue | undefined>(  undefined,);

// LanguageProviderProps describes what props the LanguageProvider accepts.
// children means all components/pages inside this provider.
type LanguageProviderProps = {  children: ReactNode;};

// getStoredLanguageCode reads the saved language from localStorage.
// If localStorage is not available or the value is invalid, we use English.
function getStoredLanguageCode(): LanguageCode {
  if (typeof window === "undefined") {    return defaultLanguage;  }
  const savedLanguageCode = window.localStorage.getItem(languageStorageKey);
  if (savedLanguageCode && isLanguageCode(savedLanguageCode)) { return savedLanguageCode;  }
  return defaultLanguage;
}

// getServerLanguageCode is used during server rendering and hydration.
// It must return the same value on server and first browser render.
function getServerLanguageCode(): LanguageCode {  return defaultLanguage;}

// subscribeToLanguageChanges tells React when the external language value changes.
function subscribeToLanguageChanges(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(languageChangeEventName, onStoreChange);

  return () => { window.removeEventListener("storage", onStoreChange); window.removeEventListener(languageChangeEventName, onStoreChange);  };
}

// LanguageProvider shares the selected language with all child components.
export function LanguageProvider({ children }: LanguageProviderProps) {
  const languageCode = useSyncExternalStore( subscribeToLanguageChanges, getStoredLanguageCode, getServerLanguageCode, );

  // setLanguageCode saves the new language and notifies the current tab.
  const setLanguageCode = useCallback((nextLanguageCode: LanguageCode) => {window.localStorage.setItem(languageStorageKey, nextLanguageCode); window.dispatchEvent(new Event(languageChangeEventName));  }, []);
  const contextValue = useMemo( () => ({ languageCode, setLanguageCode, }), [languageCode, setLanguageCode],  );

  return ( <LanguageContext.Provider value={contextValue}> {children} </LanguageContext.Provider>  );
}

// useLanguage is a helper hook for reading and changing the selected language.
export function useLanguage() {
  const contextValue = useContext(LanguageContext);
  if (!contextValue) { throw new Error("useLanguage must be used inside LanguageProvider"); }

  return contextValue;
}
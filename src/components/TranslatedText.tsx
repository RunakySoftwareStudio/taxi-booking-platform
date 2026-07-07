"use client";

/*
  TranslatedText is a small helper component for showing translated text.

  Why we use this component:
    - It can read the selected language from LanguageProvider.
    - It keeps bigger pages like HomePage.tsx from becoming client components.
    - Server components can still use this small client component inside JSX.
*/

import {
  getTranslation,
  type TranslationSectionName,
} from "@/lib/i18n/translations";
import { useLanguage } from "@/components/LanguageProvider";

// TranslatedTextProps describes which translation text we want to show.
// sectionName is the group, for example "homepage" or "navigation".
// textKey is the specific text inside that group.
type TranslatedTextProps = {
  sectionName: TranslationSectionName;
  textKey: string;
};

export function TranslatedText({
  sectionName,
  textKey,
}: TranslatedTextProps) {
  const { languageCode } = useLanguage();

  return <>{getTranslation(sectionName, textKey, languageCode)}</>;
}
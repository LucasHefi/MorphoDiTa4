import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import cs from './cs.json';
import en from './en.json';
import pl from './pl.json';
import { readInitialSettings } from '../services/settings';

const initialLang = readInitialSettings().state.language;

i18n
  .use(initReactI18next)
  .init({
    resources: {
      cs: { translation: cs },
      en: { translation: en },
      pl: { translation: pl },
    },
    lng: initialLang,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // react already safes from xss
    },
  });

export default i18n;

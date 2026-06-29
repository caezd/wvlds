import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, type Locale } from './locales';

function matchLocale(value: string | undefined | null): Locale | null {
  if (!value) return null;
  const base = value.split('-')[0].toLowerCase() as Locale;
  return SUPPORTED_LOCALES.includes(base) ? base : null;
}

export default getRequestConfig(async () => {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);

  const locale: Locale =
    matchLocale(cookieStore.get('NEXT_LOCALE')?.value) ??
    matchLocale(headerStore.get('accept-language')?.split(',')[0]) ??
    DEFAULT_LOCALE;

  const messages = (await import(`../messages/${locale}.json`)).default;

  return { locale, messages };
});

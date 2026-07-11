import logger from '@/lib/logger';
/**
 * Public settings API - accessible without authentication
 * Returns only publicly available settings such as loginType
 */
import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';

const DEFAULT_SITE_TITLE = 'Hanimo';
const DEFAULT_SITE_DESCRIPTION = 'Self-hosted AI workspace';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

export async function GET() {
  try {
    const result = await query(
      `SELECT
         login_type,
         site_title,
         site_description,
         favicon_url,
         theme_preset,
         theme_colors,
         chat_widget_enabled,
         support_contacts,
         support_contacts_enabled
       FROM settings
       WHERE config_type = 'general'
       LIMIT 1`
    );
    const settings = result.rows[0] || {};

    // Return only publicly available settings (exclude sensitive info)
    return NextResponse.json(
      {
        loginType: settings.login_type || 'local',
        siteTitle: settings.site_title || DEFAULT_SITE_TITLE,
        siteDescription: settings.site_description || DEFAULT_SITE_DESCRIPTION,
        faviconUrl: settings.favicon_url || null,
        themePreset: settings.theme_preset || 'amber-soft',
        themeColors: settings.theme_colors || {},
        // Public display settings (consumed by login page + global ChatWidget)
        chatWidgetEnabled: settings.chat_widget_enabled ?? false,
        supportContacts: Array.isArray(settings.support_contacts)
          ? settings.support_contacts
          : [],
        supportContactsEnabled: settings.support_contacts_enabled ?? true,
      },
      {
        headers: NO_STORE_HEADERS,
      }
    );
  } catch (error) {
    logger.error('Failed to fetch public settings:', error);

    // Return defaults on DB error
    return NextResponse.json(
      {
        loginType: 'local',
        siteTitle: DEFAULT_SITE_TITLE,
        siteDescription: DEFAULT_SITE_DESCRIPTION,
        faviconUrl: null,
        themePreset: 'amber-soft',
        themeColors: {},
        chatWidgetEnabled: false,
        supportContacts: [],
        supportContactsEnabled: true,
      },
      {
        headers: NO_STORE_HEADERS,
      }
    );
  }
}

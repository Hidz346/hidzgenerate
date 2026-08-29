import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://plbxenomvnqlvhghtnil.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_4O21_7WPdydiP0QFtjFIcA_PKiWOEMn';

export const BUCKET = 'hidzgenerate';

const isConfigured =
  /^https:\/\/[^\s/]+(?:\/[^\s]*)?$/i.test(SUPABASE_URL) &&
  /^(eyJ|sb_)/.test(SUPABASE_ANON_KEY);

export const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

export const RESUMABLE_ENDPOINT = isConfigured
  ? `${SUPABASE_URL}/storage/v1/upload/resumable`
  : '';

export const RESUMABLE_ENDPOINT_FALLBACK = RESUMABLE_ENDPOINT;

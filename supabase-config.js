import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://plbxenomvnqlvhgbtnil.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_4O21_7WPdydiP0QFtjFIcA_PKiWOEMn';

export const BUCKET = 'hidzgenerate';

const isConfigured =
  /^https:\/\/[^\s/]+(?:\/[^\s]*)?$/i.test(SUPABASE_URL) &&
  /^(eyJ|sb_)/.test(SUPABASE_ANON_KEY);

export const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// Ref proyek diambil dari SUPABASE_URL (mis. "plbxenomvnqlvhgbtnil" dari
// "https://plbxenomvnqlvhgbtnil.supabase.co"), dipakai buat nyusun domain
// storage langsung di bawah.
const PROJECT_REF = isConfigured ? new URL(SUPABASE_URL).hostname.split('.')[0] : '';

// Endpoint storage langsung (domain khusus *.storage.supabase.co, sesuai
// rekomendasi resmi Supabase buat resumable upload) — dicoba duluan.
export const RESUMABLE_ENDPOINT = isConfigured
  ? `https://${PROJECT_REF}.storage.supabase.co/storage/v1/upload/resumable`
  : '';

// Fallback pakai domain proyek utama — sengaja host yang BEDA dari
// RESUMABLE_ENDPOINT di atas (sebelumnya keduanya sama persis, jadi logika
// fallback di script.js nggak pernah benar-benar pindah endpoint).
export const RESUMABLE_ENDPOINT_FALLBACK = isConfigured
  ? `${SUPABASE_URL}/storage/v1/upload/resumable`
  : '';

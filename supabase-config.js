// Ambil URL & anon key dari Supabase Dashboard > Project Settings > API
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = 'https://plbxenomvnqlvhghtnil.supabase.co';
const supabaseAnonKey = 'sb_publishable_4O21_7WPdydiP0QFtjFIcA_PKiWOEMn';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
export const BUCKET = 'hidzgenerate';

// Dipakai khusus buat upload resumable (TUS), yang jalan lewat endpoint Storage
// langsung (di luar supabase-js), makanya anon key-nya perlu diekspor juga.
export const SUPABASE_ANON_KEY = supabaseAnonKey;

const projectRef = supabaseUrl.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co\/?$/i)?.[1];

// Endpoint resmi Supabase buat resumable upload, pakai hostname storage langsung
// (lebih cepat, direkomendasikan Supabase buat upload file besar). Kalau URL-nya
// bukan format standar *.supabase.co (misal domain custom/self-host), fallback ke
// endpoint resumable di bawah domain itu sendiri.
export const RESUMABLE_ENDPOINT = projectRef
  ? `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`
  : `${supabaseUrl.replace(/\/$/, '')}/storage/v1/upload/resumable`;

// Endpoint cadangan di domain project utama (bukan hostname storage langsung).
// Dipakai otomatis sama script.js kalau RESUMABLE_ENDPOINT di atas sama sekali
// nggak bisa dihubungi — subdomain storage langsung kadang belum ke-resolve di
// sebagian jaringan/DNS resolver walau project-nya sendiri aktif dan sehat.
export const RESUMABLE_ENDPOINT_FALLBACK = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/upload/resumable`;

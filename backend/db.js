// db.js — handles Supabase connections and queries

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

// Load environment variables from .env
dotenv.config();

// Create Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing Supabase credentials in .env file");
  process.exit(1);
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// --- Fetch all menu items ---
export async function getAllMenuItems() {
  const { data, error } = await supabase
    .from("menu_items_final")
    .select("*")
    .order("date", { ascending: false });

  if (error) {
    console.error("❌ Supabase query failed:", error.message);
    return [];
  }

  return data;
}

// --- Fetch menu items for a specific date ---
export async function getMenuItemsByDate(targetDate) {
  const { data, error } = await supabase
    .from("menu_items_final")
    .select("*")
    .eq("date", targetDate)
    .order("meal", { ascending: true });

  if (error) {
    console.error("❌ Supabase query failed:", error.message);
    return [];
  }

  return data;
}

// --- Search by name keyword (for AI / frontend queries) ---
export async function searchMenuItems(keyword) {
  const { data, error } = await supabase
    .from("menu_items_final")
    .select("*")
    .ilike("name", `%${keyword}%`);

  if (error) {
    console.error("❌ Supabase search failed:", error.message);
    return [];
  }

  return data;
}

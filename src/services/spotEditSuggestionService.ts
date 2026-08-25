import { hasSupabaseConfig, supabase } from '../lib/supabase';
import type { NewSpotEditSuggestion, SpotEditSuggestion } from '../types';

const localSuggestions: SpotEditSuggestion[] = [];

function normalizeSuggestion(row: any): SpotEditSuggestion {
  return {
    ...row,
    status: row.status ?? 'pending',
  };
}

function createLocalSuggestion(suggestion: NewSpotEditSuggestion): SpotEditSuggestion {
  const created: SpotEditSuggestion = {
    id: `local-spot-edit-${Date.now()}`,
    status: 'pending',
    admin_notes: null,
    created_at: new Date().toISOString(),
    ...suggestion,
  };
  localSuggestions.unshift(created);
  return created;
}

export const spotEditSuggestionService = {
  async createSuggestion(suggestion: NewSpotEditSuggestion): Promise<SpotEditSuggestion> {
    const suggestedValue = suggestion.suggested_value.trim();
    if (!suggestedValue) throw new Error('Add the corrected detail before submitting.');

    const payload: NewSpotEditSuggestion = {
      ...suggestion,
      field: suggestion.field.trim(),
      current_value: suggestion.current_value?.trim() || null,
      suggested_value: suggestedValue,
      note: suggestion.note?.trim() || null,
    };

    if (!hasSupabaseConfig) return createLocalSuggestion(payload);

    const { data, error } = await supabase
      .from('spot_edit_suggestions')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      const missingTable = /spot_edit_suggestions|relation|schema cache|does not exist/i.test(error.message ?? '');
      if (missingTable) return createLocalSuggestion(payload);
      throw error;
    }

    return normalizeSuggestion(data);
  },
};

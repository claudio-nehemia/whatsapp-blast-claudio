use calamine::{Reader, open_workbook_auto, Data};
use std::path::Path;
use mongodb::bson::Document;
use serde::Deserialize;
use serde_json::json;

pub struct ParsedSheet {
    pub name: String,
    pub headers: Vec<String>,
    pub rows: Vec<ParsedRow>,
}

pub struct ParsedExcel {
    pub sheets: Vec<ParsedSheet>,
}

pub struct ParsedRow {
    pub name: String,
    pub phone: String,
    pub dynamic_fields: Document,
}

#[derive(Deserialize, Debug)]
pub struct GeminiAnalysis {
    pub name_column_index: usize,
    pub phone_column_indices: Vec<usize>,
    pub column_mappings: std::collections::HashMap<String, String>,
}

pub async fn analyze_layout_with_groq(
    sheet_name: &str,
    sample_rows: &Vec<Vec<String>>,
    api_key: &str,
) -> Result<GeminiAnalysis, String> {
    let url = "https://api.groq.com/openai/v1/chat/completions";

    let prompt = format!(
        "You are an expert data analyst. You are given a sample of rows from the sheet '{}' of a student spreadsheet.\n\
         Analyze the spreadsheet layout and identify the purpose of each column index.\n\
         The spreadsheet has no header row. Some columns at the beginning might be empty or index numbers.\n\
         Identify the column index that contains student/contact names (usually alphabetical strings like 'DEVOND STILER RORANO').\n\
         Identify all column indices containing phone numbers (usually starting with '8', '08', '+62' or digits like '82159498434', '81311543737').\n\
         Generate clean, short snake_case header names for all columns based on their content (e.g. 'nim', 'name', 'gender', 'major', 'semester', 'phone_1', 'phone_2', 'class_type', 'campus').\n\
         \n\
         Sample rows:\n\
         {}\n\
         \n\
         Output ONLY a valid JSON object matching this schema:\n\
         {{\n\
           \"name_column_index\": number,\n\
           \"phone_column_indices\": number[],\n\
           \"column_mappings\": {{ \"0\": \"header_name\", \"1\": \"header_name\", ... }}\n\
         }}",
        sheet_name,
        serde_json::to_string_pretty(sample_rows).unwrap_or_default()
    );

    let client = reqwest::Client::new();
    let res = client.post(url)
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&json!({
            "model": "llama-3.3-70b-versatile",
            "messages": [{
                "role": "user",
                "content": prompt
            }],
            "response_format": {
                "type": "json_object"
            }
        }))
        .send()
        .await
        .map_err(|e| format!("Failed to call Groq API: {}", e))?;

    let json_resp: serde_json::Value = res.json()
        .await
        .map_err(|e| format!("Failed to parse Groq response: {}", e))?;

    if let Some(err) = json_resp.get("error") {
        return Err(format!("Groq API error: {}", err["message"].as_str().unwrap_or("Unknown error")));
    }

    let text = json_resp["choices"][0]["message"]["content"]
        .as_str()
        .ok_or_else(|| format!("Invalid response structure from Groq: {:?}", json_resp))?
        .trim();

    let analysis: GeminiAnalysis = serde_json::from_str(text)
        .map_err(|e| format!("Failed to parse Groq output JSON: {}. Text: {}", e, text))?;

    Ok(analysis)
}

pub async fn parse_excel_file_async<P: AsRef<Path>>(
    path: P,
    groq_api_key: Option<String>,
) -> Result<ParsedExcel, String> {
    // Read workbook in block_in_place
    let (mut workbook, sheet_names) = tokio::task::block_in_place(|| {
        let workbook = open_workbook_auto(path).map_err(|e| format!("Failed to open Excel file: {}", e))?;
        let names = workbook.sheet_names().to_vec();
        Ok::<_, String>((workbook, names))
    })?;

    let mut parsed_sheets = Vec::new();

    for sheet_name in sheet_names {
        println!("Parsing Excel sheet: {}", sheet_name);
        
        let range = match workbook.worksheet_range(&sheet_name) {
            Ok(r) => r,
            Err(_) => {
                println!("Skipping sheet '{}', could not read range", sheet_name);
                continue;
            }
        };

        // Extract first 15 rows as sample
        let mut sample_rows = Vec::new();
        let mut non_empty_count = 0;

        for row in range.rows().take(15) {
            let mut row_has_data = false;
            let row_vals: Vec<String> = row.iter().map(|cell| {
                let val = match cell {
                    Data::Empty => String::new(),
                    Data::String(s) => s.trim().to_string(),
                    Data::Float(f) => {
                        if f.fract() == 0.0 {
                            format!("{:.0}", f)
                        } else {
                            f.to_string()
                        }
                    },
                    Data::Int(i) => i.to_string(),
                    Data::Bool(b) => b.to_string(),
                    Data::DateTime(d) => d.to_string(),
                    _ => cell.to_string().trim().to_string(),
                };
                if !val.is_empty() {
                    row_has_data = true;
                }
                val
            }).collect();

            if row_has_data {
                non_empty_count += 1;
            }
            sample_rows.push(row_vals);
        }

        if non_empty_count == 0 {
            println!("Skipping empty sheet: {}", sheet_name);
            continue;
        }

        // ============================================================
        // STEP 1: Scan rows 0-4 to find a header row
        // ============================================================
        let header_keywords: Vec<&str> = vec![
            "nama", "name", "nim", "nrp", "jurusan", "major", "prodi",
            "gender", "jenis", "kelamin", "angkatan", "semester",
            "telepon", "telp", "phone", "wa", "whatsapp", "hp",
            "nomor", "kampus", "campus", "kelas", "class", "cabang",
            "kategori", "email", "alamat", "address", "divisi", "jabatan",
        ];

        let mut header_row_idx: Option<usize> = None;
        let mut detected_header_labels: Vec<String> = Vec::new();

        for (row_idx, row) in range.rows().enumerate().take(5) {
            let mut non_empty_count = 0;
            let mut keyword_match_count = 0;
            let mut row_labels = Vec::new();

            for cell in row.iter() {
                let val = cell.to_string().trim().to_string();
                if !val.is_empty() {
                    non_empty_count += 1;
                }
                let val_lower = val.to_lowercase();

                if !val.is_empty() {
                    let is_keyword = header_keywords.iter().any(|kw| {
                        val_lower == *kw || val_lower.contains(kw)
                    });
                    if is_keyword {
                        keyword_match_count += 1;
                    }
                }

                row_labels.push(clean_header_name(&val));
            }

            // A header row has at least 3 non-empty cells AND at least 2 keyword matches
            // This filters out title rows like "Data Mahasiswa" which have only 1-2 cells
            if non_empty_count >= 3 && keyword_match_count >= 2 {
                header_row_idx = Some(row_idx);
                detected_header_labels = row_labels;
                println!("Detected header row at index {} for sheet '{}' ({} keywords matched)", row_idx, sheet_name, keyword_match_count);
                break;
            }
        }

        let mut headers: Vec<String> = Vec::new();
        let mut name_idx: usize = 0;
        let mut phone_idx: usize = 1;
        let mut phone_indices: Vec<usize> = vec![1];
        let mut column_mappings: std::collections::HashMap<String, String> = std::collections::HashMap::new();
        let mut data_start_row: usize;
        let mut use_column_mappings = false;

        if let Some(hdr_row) = header_row_idx {
            // ============================================================
            // STEP 2A: Header found — use header labels directly, NO AI
            // ============================================================
            data_start_row = hdr_row + 1;
            headers = detected_header_labels;
            phone_indices.clear();

            let mut found_name = false;
            let mut found_phone = false;

            for (i, label) in headers.iter().enumerate() {
                let l = label.to_lowercase();
                if !found_name && (l == "nama" || l == "name" || l == "nama_lengkap" || l == "fullname" || l.contains("nama")) {
                    name_idx = i;
                    found_name = true;
                }
                if l.contains("telepon") || l.contains("telp") || l.contains("phone")
                   || l.contains("nomor") || l == "wa" || l == "whatsapp" || l == "hp"
                   || l == "no_hp" || l == "no_wa"
                {
                    if !found_phone {
                        phone_idx = i;
                        found_phone = true;
                    }
                    phone_indices.push(i);
                }
            }

            if phone_indices.is_empty() {
                phone_indices.push(phone_idx);
            }

            println!("Header-derived mapping for '{}': name_idx={}, phone_idx={}, phone_indices={:?}, data_start_row={}, headers={:?}",
                sheet_name, name_idx, phone_idx, phone_indices, data_start_row, headers);

        } else {
            // ============================================================
            // STEP 2B: No header — use AI + heuristic fallback
            // ============================================================

            // Detect title rows (very few non-empty cells, e.g. "Data Mahasiswa")
            let title_rows_to_skip = {
                let mut skip = 0;
                for (row_idx, row) in range.rows().enumerate().take(3) {
                    let non_empty: usize = row.iter()
                        .filter(|c| !c.to_string().trim().is_empty())
                        .count();
                    if non_empty <= 2 {
                        skip = row_idx + 1;
                    } else {
                        break;
                    }
                }
                skip
            };
            data_start_row = title_rows_to_skip;

            // Call Groq for AI analysis (with throttling)
            let analysis = if let Some(ref api_key) = groq_api_key {
                if !api_key.is_empty() {
                    tokio::time::sleep(std::time::Duration::from_millis(4000)).await;
                    println!("Calling Groq API to analyze sheet layout for '{}'...", sheet_name);
                    match analyze_layout_with_groq(&sheet_name, &sample_rows, api_key).await {
                        Ok(ana) => {
                            println!("Groq analysis succeeded for '{}': {:?}", sheet_name, ana);
                            Some(ana)
                        }
                        Err(err) => {
                            println!("Groq analysis failed for '{}': {}. Falling back to heuristic.", sheet_name, err);
                            None
                        }
                    }
                } else {
                    None
                }
            } else {
                None
            };

            // Run heuristic scoring on actual data rows (skip title/header rows)
            let mut phone_scores: std::collections::HashMap<usize, i32> = std::collections::HashMap::new();
            let mut name_scores: std::collections::HashMap<usize, f64> = std::collections::HashMap::new();
            let mut col_values: std::collections::HashMap<usize, Vec<String>> = std::collections::HashMap::new();

            for (row_idx, row) in range.rows().enumerate().take(20) {
                if row_idx < data_start_row { continue; }
                for (i, cell) in row.iter().enumerate() {
                    let val = cell.to_string().trim().to_string();
                    if val.is_empty() { continue; }

                    col_values.entry(i).or_insert_with(Vec::new).push(val.clone());

                    let clean_digits: String = val.chars().filter(|c| c.is_ascii_digit()).collect();
                    if clean_digits.len() >= 9 && clean_digits.len() <= 15 {
                        if val.starts_with('0') || val.starts_with('8') || val.starts_with('+') || val.starts_with('6') {
                            *phone_scores.entry(i).or_insert(0) += 1;
                        }
                    }
                }
            }

            for (col_idx, values) in &col_values {
                let total_values = values.len();
                if total_values == 0 { continue; }

                let unique_count = {
                    let mut uv = values.clone();
                    uv.sort();
                    uv.dedup();
                    uv.len()
                };

                let cardinality = (unique_count as f64) / (total_values as f64);

                let mut name_hits = 0.0;
                for val in values {
                    if val.len() > 3
                       && val.chars().any(|c| c.is_alphabetic())
                       && !val.chars().any(|c| c.is_ascii_digit())
                    {
                        let mut val_score = 1.0;
                        if val.contains(' ') {
                            val_score += 1.0;
                        }
                        name_hits += val_score;
                    }
                }

                let weighted_score = name_hits * cardinality;
                name_scores.insert(*col_idx, weighted_score);
            }

            let mut best_name_score = -1.0;
            for (idx, score) in &name_scores {
                if *score > best_name_score {
                    best_name_score = *score;
                    name_idx = *idx;
                }
            }

            let mut best_phone_score = 0;
            for (idx, score) in &phone_scores {
                if *idx == name_idx { continue; }
                if *score > best_phone_score {
                    best_phone_score = *score;
                    phone_idx = *idx;
                }
            }
            phone_indices = vec![phone_idx];

            // Use AI column mappings if available, otherwise generate generic headers
            if let Some(ana) = &analysis {
                use_column_mappings = true;
                column_mappings = ana.column_mappings.clone();

                let name_str = name_idx.to_string();
                let phone_str = phone_idx.to_string();

                let mut final_mappings = std::collections::HashMap::new();
                for (k, v) in &column_mappings {
                    if k == &name_str {
                        final_mappings.insert(k.clone(), "name".to_string());
                    } else if k == &phone_str {
                        final_mappings.insert(k.clone(), "phone".to_string());
                    } else {
                        let v_lower = v.to_lowercase();
                        if v_lower == "name" || v_lower == "nama" || v_lower == "nama_lengkap" {
                            final_mappings.insert(k.clone(), format!("column_{}", k));
                        } else if v_lower == "phone" || v_lower == "wa" || v_lower == "whatsapp" {
                            final_mappings.insert(k.clone(), format!("phone_{}", k));
                        } else {
                            final_mappings.insert(k.clone(), v.clone());
                        }
                    }
                }

                final_mappings.entry(name_str).or_insert_with(|| "name".to_string());
                final_mappings.entry(phone_str).or_insert_with(|| "phone".to_string());
                column_mappings = final_mappings;

                let mut sorted_indices: Vec<usize> = column_mappings.keys()
                    .filter_map(|k| k.parse::<usize>().ok())
                    .collect();
                sorted_indices.sort();

                for idx in sorted_indices {
                    if let Some(hdr_name) = column_mappings.get(&idx.to_string()) {
                        headers.push(hdr_name.clone());
                    }
                }
            } else {
                let max_cols = range.rows().next().map(|r| r.len()).unwrap_or(2);
                headers = (0..max_cols).map(|i| {
                    if i == name_idx {
                        "name".to_string()
                    } else if i == phone_idx {
                        "phone".to_string()
                    } else {
                        format!("column_{}", i + 1)
                    }
                }).collect();
            }
        }

        let mut parsed_rows = Vec::new();

        for (row_idx, row) in range.rows().enumerate() {
            if row_idx < data_start_row {
                continue;
            }

            let mut name = String::new();
            let mut phone = String::new();
            let mut dynamic_fields = Document::new();
            let mut has_data = false;

            for (i, cell) in row.iter().enumerate() {
                let val = match cell {
                    Data::Empty => String::new(),
                    Data::String(s) => s.trim().to_string(),
                    Data::Float(f) => {
                        if f.fract() == 0.0 {
                            format!("{:.0}", f)
                        } else {
                            f.to_string()
                        }
                    },
                    Data::Int(val) => val.to_string(),
                    Data::Bool(b) => b.to_string(),
                    Data::DateTime(d) => d.to_string(),
                    _ => cell.to_string().trim().to_string(),
                };

                if !val.is_empty() {
                    has_data = true;
                }

                if use_column_mappings {
                    // AI-mapped path: only insert columns present in column_mappings
                    if let Some(clean_hdr) = column_mappings.get(&i.to_string()) {
                        if i == name_idx {
                            name = val.clone();
                        }

                        if phone_indices.contains(&i) {
                            let clean_phone: String = val.chars().filter(|c| c.is_ascii_digit()).collect();
                            if !clean_phone.is_empty() && phone.is_empty() {
                                phone = val.clone();
                            }
                        }

                        dynamic_fields.insert(clean_hdr, val);
                    }
                } else {
                    // Header-detected or heuristic path
                    // Skip columns with empty headers (side tables, summary columns)
                    if i >= headers.len() || headers[i].is_empty() {
                        continue;
                    }

                    if i == name_idx {
                        name = val.clone();
                    }
                    if phone_indices.contains(&i) {
                        let clean_phone: String = val.chars().filter(|c| c.is_ascii_digit()).collect();
                        if !clean_phone.is_empty() && phone.is_empty() {
                            phone = val.clone();
                        }
                    }

                    dynamic_fields.insert(&headers[i], val);
                }
            }

            if !has_data {
                continue;
            }

            if name.is_empty() || phone.is_empty() {
                continue;
            }

            parsed_rows.push(ParsedRow {
                name,
                phone,
                dynamic_fields,
            });
        }

        if parsed_rows.is_empty() {
            println!("Skipping sheet '{}', no valid contacts found", sheet_name);
            continue;
        }

        // Filter out empty headers before storing (removes side table columns)
        let stored_headers: Vec<String> = headers.iter().filter(|h| !h.is_empty()).cloned().collect();

        parsed_sheets.push(ParsedSheet {
            name: sheet_name,
            headers: stored_headers,
            rows: parsed_rows,
        });
    }

    if parsed_sheets.is_empty() {
        return Err("No sheets in the Excel file contained valid contact data".to_string());
    }

    Ok(ParsedExcel {
        sheets: parsed_sheets,
    })
}

pub fn clean_header_name(name: &str) -> String {
    name.to_lowercase()
        .trim()
        .replace(" ", "_")
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '_')
        .collect()
}

use crate::db::DbState;
use chrono::{Duration, Local};
use rusqlite::{params, Connection, Result};
use serde::{ser::SerializeSeq, Serialize, Serializer};
use tauri::Manager;

// Optional, versioned feature extension. Core schema-v4 backups remain compatible;
// SQLite backups automatically include this table, and old backups start a new history.
pub fn initialize(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS dashboard_snapshots_v1 (
        day TEXT PRIMARY KEY NOT NULL,
        captured_at TEXT NOT NULL,
        forms INTEGER NOT NULL CHECK(forms >= 0),
        lemmas INTEGER NOT NULL CHECK(lemmas >= 0),
        bytes INTEGER NOT NULL CHECK(bytes >= 0)
    );",
    )
}

#[derive(Serialize)]
pub struct Day {
    day: String,
    analyzer: i64,
    wizard: i64,
    legacy: i64,
    runs: i64,
}
#[derive(Serialize)]
pub struct Snapshot {
    day: String,
    forms: i64,
    lemmas: i64,
    bytes: i64,
}
#[derive(Serialize)]
pub struct Term {
    term: String,
    count: i64,
}
#[derive(Serialize)]
pub struct Recent {
    workflow: String,
    id: i64,
    operation: String,
    model: String,
    words: i64,
    status: String,
    created_at: String,
}
#[derive(Serialize)]
pub struct Dashboard {
    start: String,
    end: String,
    words: i64,
    runs: i64,
    forms: i64,
    lemmas: i64,
    bytes: i64,
    daily: Vec<Day>,
    history: Vec<Snapshot>,
    frequent_forms: Vec<Term>,
    frequent_lemmas: Vec<Term>,
    recent: Vec<Recent>,
}

fn words(input: &str) -> impl Iterator<Item = String> + '_ {
    input
        .split(|c: char| c.is_whitespace() || [',', ';', '.'].contains(&c))
        .filter(|word| word.chars().any(char::is_alphabetic))
        .map(|word| {
            word.trim_matches(|c: char| !c.is_alphabetic())
                .chars()
                .filter(|c| !c.is_numeric())
                .collect()
        })
}
struct WordJson<'a>(&'a str);
impl Serialize for WordJson<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        let mut sequence = serializer.serialize_seq(None)?;
        for word in words(self.0) {
            sequence.serialize_element(&word)?;
        }
        sequence.end()
    }
}
fn register_functions(conn: &Connection) -> Result<()> {
    let flags = rusqlite::functions::FunctionFlags::SQLITE_UTF8
        | rusqlite::functions::FunctionFlags::SQLITE_DETERMINISTIC;
    conn.create_scalar_function("DASH_COUNT", 1, flags, |c| {
        let input: String = c.get(0)?;
        Ok(input
            .split(|c: char| c.is_whitespace() || [',', ';', '.'].contains(&c))
            .filter(|w| w.chars().any(char::is_alphabetic))
            .count() as i64)
    })?;
    conn.create_scalar_function("DASH_WORDS", 1, flags, |c| {
        let input: String = c.get(0)?;
        serde_json::to_string(&WordJson(&input))
            .map_err(|e| rusqlite::Error::UserFunctionError(Box::new(e)))
    })
}
fn database_bytes(conn: &Connection) -> i64 {
    if let Some(path) = conn.path().filter(|p| !p.is_empty() && *p != ":memory:") {
        [path.to_owned(), format!("{path}-wal")]
            .iter()
            .filter_map(|p| std::fs::metadata(p).ok())
            .map(|m| m.len() as i64)
            .sum()
    } else {
        let pages: i64 = conn
            .query_row("PRAGMA page_count", [], |r| r.get(0))
            .unwrap_or(0);
        let size: i64 = conn
            .query_row("PRAGMA page_size", [], |r| r.get(0))
            .unwrap_or(0);
        pages.saturating_mul(size)
    }
}

pub fn collect(conn: &Connection, days: u16) -> Result<Dashboard> {
    if ![7, 30, 90, 365].contains(&days) {
        return Err(rusqlite::Error::InvalidParameterName(
            "Unsupported period".into(),
        ));
    }
    register_functions(conn)?;
    initialize(conn)?;
    let today = Local::now().date_naive();
    let end = today.to_string();
    let start = (today - Duration::days(i64::from(days) - 1)).to_string();
    let forms: i64 = conn.query_row("SELECT COUNT(*) FROM (
        SELECT MORPHODITA_KEY(original_form) AS value FROM morphological_data WHERE original_form IS NOT NULL AND original_form <> ''
        UNION SELECT MORPHODITA_KEY(generated_form) FROM morphological_data WHERE generated_form IS NOT NULL AND generated_form <> ''
    )", [], |r| r.get(0))?;
    let lemmas: i64 = conn.query_row(
        "SELECT COUNT(DISTINCT MORPHODITA_KEY(lemma)) FROM morphological_data WHERE lemma <> ''",
        [],
        |r| r.get(0),
    )?;
    let bytes = database_bytes(conn);
    conn.execute("INSERT INTO dashboard_snapshots_v1(day,captured_at,forms,lemmas,bytes) VALUES(?1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),?2,?3,?4)
        ON CONFLICT(day) DO UPDATE SET captured_at=excluded.captured_at, forms=excluded.forms, lemmas=excluded.lemmas, bytes=excluded.bytes", params![end,forms,lemmas,bytes])?;
    let mut statement = conn.prepare("SELECT date(created_at,'localtime') AS day,
        SUM(CASE WHEN json_extract(CASE WHEN json_valid(parameters) THEN parameters ELSE '{}' END,'$.workflow')='analyzer' THEN DASH_COUNT(input_text) ELSE 0 END),
        SUM(CASE WHEN json_extract(CASE WHEN json_valid(parameters) THEN parameters ELSE '{}' END,'$.workflow')='wizard' THEN DASH_COUNT(input_text) ELSE 0 END),
        SUM(CASE WHEN COALESCE(json_extract(CASE WHEN json_valid(parameters) THEN parameters ELSE '{}' END,'$.workflow'),'') NOT IN ('analyzer','wizard') THEN DASH_COUNT(input_text) ELSE 0 END), COUNT(*)
        FROM sessions WHERE status='completed' AND date(created_at,'localtime') BETWEEN ?1 AND ?2 GROUP BY day ORDER BY day")?;
    let daily = statement
        .query_map(params![start, end], |r| {
            Ok(Day {
                day: r.get(0)?,
                analyzer: r.get(1)?,
                wizard: r.get(2)?,
                legacy: r.get(3)?,
                runs: r.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;
    let words = daily.iter().map(|d| d.analyzer + d.wizard + d.legacy).sum();
    let runs = daily.iter().map(|d| d.runs).sum();
    let mut statement = conn.prepare("SELECT day,forms,lemmas,bytes FROM dashboard_snapshots_v1 WHERE day BETWEEN ?1 AND ?2 ORDER BY day")?;
    let history = statement
        .query_map(params![start, end], |r| {
            Ok(Snapshot {
                day: r.get(0)?,
                forms: r.get(1)?,
                lemmas: r.get(2)?,
                bytes: r.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;
    // Materialize input frequencies once before joining dictionary mappings. Joining
    // json_each directly to each lemma would reparse a million-word input per lemma.
    let mut statement = conn.prepare("WITH counts AS MATERIALIZED (
        SELECT s.id AS session_id,MORPHODITA_KEY(w.value) AS form,MIN(w.value) AS label,COUNT(*) AS frequency
        FROM sessions s,json_each(DASH_WORDS(s.input_text)) w
        WHERE s.status='completed' AND s.operation IN ('tag','analyze') AND date(s.created_at,'localtime') BETWEEN ?1 AND ?2
        GROUP BY s.id,form),
        pairs AS (
            SELECT m.session_id,MORPHODITA_KEY(original_form) AS form,MORPHODITA_KEY(lemma) AS lemma_key,MIN(lemma) AS label
            FROM morphological_data m JOIN (SELECT DISTINCT session_id FROM counts) selected ON selected.session_id=m.session_id
            WHERE source_type='analysis' AND original_form IS NOT NULL AND original_form<>''
            GROUP BY m.session_id,form,lemma_key),
        forms_ranked AS (SELECT MIN(label) AS label,SUM(frequency) AS total,form FROM counts GROUP BY form ORDER BY total DESC,form LIMIT 10),
        lemmas_ranked AS (SELECT MIN(p.label) AS label,SUM(c.frequency) AS total,p.lemma_key
            FROM counts c JOIN pairs p ON p.session_id=c.session_id AND p.form=c.form
            GROUP BY p.lemma_key ORDER BY total DESC,p.lemma_key LIMIT 10)
        SELECT 0,label,total FROM forms_ranked UNION ALL SELECT 1,label,total FROM lemmas_ranked")?;
    let mut frequent_forms = Vec::new();
    let mut frequent_lemmas = Vec::new();
    for row in statement.query_map(params![start, end], |r| {
        Ok((
            r.get::<_, i64>(0)?,
            Term {
                term: r.get(1)?,
                count: r.get(2)?,
            },
        ))
    })? {
        let (kind, term) = row?;
        if kind == 0 {
            frequent_forms.push(term);
        } else {
            frequent_lemmas.push(term);
        }
    }
    let mut statement = conn.prepare("SELECT id,operation,model,DASH_COUNT(input_text),status,created_at,COALESCE(json_extract(CASE WHEN json_valid(parameters) THEN parameters ELSE '{}' END,'$.workflow'),'legacy') FROM sessions
        WHERE date(created_at,'localtime') BETWEEN ?1 AND ?2 ORDER BY created_at DESC,id DESC LIMIT 5")?;
    let recent = statement
        .query_map(params![start, end], |r| {
            Ok(Recent {
                workflow: r.get(6)?,
                id: r.get(0)?,
                operation: r.get(1)?,
                model: r.get(2)?,
                words: r.get(3)?,
                status: r.get(4)?,
                created_at: r.get(5)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;
    Ok(Dashboard {
        start,
        end,
        words,
        runs,
        forms,
        lemmas,
        bytes,
        daily,
        history,
        frequent_forms,
        frequent_lemmas,
        recent,
    })
}

#[tauri::command]
pub async fn get_dashboard(
    app: tauri::AppHandle,
    days: u16,
) -> std::result::Result<Dashboard, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<DbState>();
        let guard = state
            .conn
            .lock()
            .map_err(|_| "Database lock unavailable".to_string())?;
        let conn = guard.as_ref().ok_or("Database not initialized")?;
        collect(conn, days).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Dashboard worker failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn connection() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::configure_db_connection(&conn).unwrap();
        conn
    }
    #[test]
    fn counts_real_input_occurrences_unique_values_and_deduplicates_tags() {
        let c = connection();
        c.execute("INSERT INTO sessions(operation,model,input_text,parameters,result_count,status) VALUES('analyze','test','Kočky! kočky pes 123','{\"workflow\":\"analyzer\"}',99,'completed')",[]).unwrap();
        c.execute("INSERT INTO morphological_data(session_id,source_type,original_form,lemma,tag) VALUES(1,'analysis','kočky','kočka','N1'),(1,'analysis','kočky','kočka','N2'),(1,'analysis','pes','pes','N1')",[]).unwrap();
        c.execute("INSERT INTO sessions(operation,model,input_text,parameters,result_count,status) VALUES('analyze','test','pes pes','{\"workflow\":\"wizard\"}',500,'completed'),('tag','test','ignored ignored','{}',0,'failed')",[]).unwrap();
        let d = collect(&c, 30).unwrap();
        assert_eq!(d.words, 5);
        assert_eq!(d.runs, 2);
        assert_eq!(d.forms, 2);
        assert_eq!(d.lemmas, 2);
        assert_eq!(d.daily[0].analyzer, 3);
        assert_eq!(d.daily[0].wizard, 2);
        assert_eq!(d.frequent_forms[0].term, "pes");
        assert_eq!(d.frequent_forms[0].count, 3);
        assert_eq!(
            d.frequent_lemmas
                .iter()
                .find(|t| t.term == "kočka")
                .unwrap()
                .count,
            2
        );
        assert_eq!(d.history.len(), 1);
        collect(&c, 30).unwrap();
        assert_eq!(
            c.query_row("SELECT COUNT(*) FROM dashboard_snapshots_v1", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            1
        );
        c.execute("DELETE FROM morphological_data", []).unwrap();
        assert_eq!(collect(&c, 30).unwrap().forms, 0);
    }
    #[test]
    fn periods_legacy_and_backup_preserve_only_observed_history() {
        let _lock = crate::backup::test_seams::TEST_LOCK.lock().unwrap();
        let c = connection();
        c.execute("INSERT INTO sessions(operation,model,input_text,parameters,result_count,status,created_at) VALUES('analyze','test','pes pes','invalid',2,'completed',datetime('now')),('generate','test','kočka','{}',999,'completed',datetime('now','-15 days')),('tag','test','stará data','{}',2,'completed',datetime('now','-100 days'))", []).unwrap();
        let d = collect(&c, 7).unwrap();
        assert_eq!(d.words, 2);
        assert_eq!(d.runs, 1);
        assert_eq!(d.daily[0].legacy, 2);
        assert_eq!(d.frequent_forms.len(), 1);
        assert_eq!(d.frequent_forms[0].count, 2);
        assert_eq!(d.recent[0].workflow, "legacy");
        assert_eq!(collect(&c, 30).unwrap().words, 3);
        assert_eq!(collect(&c, 365).unwrap().words, 5);
        c.execute("INSERT INTO dashboard_snapshots_v1 VALUES(date('now','localtime','-3 days'),'observed',10,5,4096)",[]).unwrap();
        let dir = std::env::temp_dir().join(format!(
            "morphodita-dashboard-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap()
        ));
        std::fs::create_dir(&dir).unwrap();
        let backup = dir.join("snapshot.sqlite");
        let restored = dir.join("restored.sqlite");
        crate::backup::backup_database(&c, &backup).unwrap();
        crate::backup::validate_backup(&backup).unwrap();
        crate::backup::restore_database(&restored, &backup).unwrap();
        let restored = Connection::open(restored).unwrap();
        crate::db::configure_db_connection(&restored).unwrap();
        let d = collect(&restored, 7).unwrap();
        assert_eq!(d.history.len(), 2);
        assert_eq!(d.history[0].forms, 10);
        assert_eq!(d.words, 2);
        restored
            .execute("DROP TABLE dashboard_snapshots_v1", [])
            .unwrap();
        assert_eq!(collect(&restored, 7).unwrap().history.len(), 1);
        drop(restored);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    #[ignore = "Large performance fixture; run separately from global allocator budget tests"]
    fn handles_a_million_input_words_without_returning_full_inputs() {
        let c = connection();
        let input = "kočky pes ".repeat(500_000);
        c.execute("INSERT INTO sessions(operation,model,input_text,parameters,result_count,status) VALUES('analyze','test',?1,'{\"workflow\":\"wizard\"}',2,'completed')",[input]).unwrap();
        c.execute("INSERT INTO morphological_data(session_id,source_type,original_form,lemma,tag) VALUES(1,'analysis','kočky','kočka','N1'),(1,'analysis','pes','pes','N1')",[]).unwrap();
        let started = std::time::Instant::now();
        let d = collect(&c, 30).unwrap();
        println!("DASHBOARD_MILLION_WORDS elapsed={:?}", started.elapsed());
        assert_eq!(d.words, 1_000_000);
        assert_eq!(d.frequent_forms[0].count, 500_000);
        assert_eq!(d.frequent_lemmas[0].count, 500_000);
        assert!(serde_json::to_vec(&d).unwrap().len() < 4096);
    }
    #[test]
    fn empty_database_has_no_fake_activity_and_only_a_real_snapshot() {
        let c = connection();
        let d = collect(&c, 7).unwrap();
        assert_eq!(d.words, 0);
        assert!(d.daily.is_empty());
        assert!(d.frequent_forms.is_empty());
        assert_eq!(d.history.len(), 1);
        assert!(collect(&c, 1).is_err());
    }
}

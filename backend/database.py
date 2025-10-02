import sqlite3
import os
import logging
import time
from typing import Dict, List, Any, Optional
from contextlib import contextmanager
from pathlib import Path
from datetime import datetime

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

DB_DIR = "./data"
DB_PATH = os.path.join(DB_DIR, "prompts.db")
RETRYABLE_ERRORS = ("locked", "readonly", "busy")
MAX_RETRIES = 5
RETRY_DELAY = 0.5

def ensure_db_directory():
    """Ensure the database directory exists."""
    Path(DB_DIR).mkdir(parents=True, exist_ok=True)
    logger.info(f"Database directory ensured at: {DB_DIR}")

@contextmanager
def get_db_connection(timeout=30.0):
    """
    Context manager for database connections with proper resource cleanup.
    
    Args:
        timeout: Database busy timeout in seconds
    
    Yields:
        sqlite3.Connection: Database connection
    """
    ensure_db_directory()
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH, timeout=timeout)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        yield conn
        conn.commit()
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Database error: {e}")
        raise
    finally:
        if conn:
            conn.close()

def init_prompts_table():
    """Initialize the saved_prompts table if it doesn't exist."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS saved_prompts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                description TEXT,
                role_prompt TEXT,
                task_prompt TEXT,
                context_prompt TEXT,
                format_prompt TEXT,
                constraints_prompt TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_by TEXT,
                tags TEXT,
                use_count INTEGER DEFAULT 0,
                last_used_at TIMESTAMP
            )
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_name ON saved_prompts(name)
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_created_at ON saved_prompts(created_at DESC)
        """)
        logger.info("Prompts table initialized successfully")

def save_prompt(
    name: str,
    description: str,
    role_prompt: str,
    task_prompt: str,
    context_prompt: str,
    format_prompt: str,
    constraints_prompt: str,
    created_by: Optional[str] = None,
    tags: Optional[str] = None
) -> Dict[str, Any]:
    """
    Save a new prompt to the database.
    
    Args:
        name: Unique name for the prompt
        description: Description of the prompt
        role_prompt: Role prompt content
        task_prompt: Task prompt content
        context_prompt: Context prompt content
        format_prompt: Format prompt content
        constraints_prompt: Constraints prompt content
        created_by: Optional creator name
        tags: Optional comma-separated tags
    
    Returns:
        Dict with success status and message or error
    """
    attempt = 0
    while attempt < MAX_RETRIES:
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO saved_prompts (
                        name, description, role_prompt, task_prompt, 
                        context_prompt, format_prompt, constraints_prompt,
                        created_by, tags
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    name, description, role_prompt, task_prompt,
                    context_prompt, format_prompt, constraints_prompt,
                    created_by, tags
                ))
                prompt_id = cursor.lastrowid
                logger.info(f"Saved prompt '{name}' with ID {prompt_id}")
                return {
                    "success": True,
                    "message": "Prompt saved successfully",
                    "id": prompt_id
                }
        except sqlite3.IntegrityError as e:
            if "UNIQUE constraint failed" in str(e):
                logger.warning(f"Prompt name '{name}' already exists")
                return {
                    "success": False,
                    "error": "A prompt with this name already exists. Please choose a different name."
                }
            raise
        except sqlite3.OperationalError as e:
            if any(err in str(e).lower() for err in RETRYABLE_ERRORS):
                attempt += 1
                logger.warning(f"Database locked, retry {attempt}/{MAX_RETRIES}: {e}")
                time.sleep(RETRY_DELAY * attempt)
            else:
                logger.error(f"Non-retryable database error: {e}")
                return {"success": False, "error": str(e)}
        except Exception as e:
            logger.error(f"Error saving prompt: {e}")
            return {"success": False, "error": str(e)}
    
    return {"success": False, "error": "Database is busy, please try again"}

def search_prompts(
    search_text: Optional[str] = None,
    search_in: str = "both",
    search_fields: Optional[List[str]] = None,
    tags: Optional[str] = None,
    created_by: Optional[str] = None,
    date_operator: Optional[str] = None,
    date_value: Optional[str] = None,
    date_value_end: Optional[str] = None,
    limit: int = 100
) -> Dict[str, Any]:
    """
    Search for saved prompts.
    
    Args:
        search_text: Text to search for
        search_in: Where to search - 'name', 'body', or 'both' (legacy, overridden by search_fields)
        search_fields: List of specific fields to search in (e.g., ['name', 'description', 'role_prompt'])
        tags: Filter by tags (comma-separated)
        created_by: Filter by creator
        date_operator: Date comparison operator - 'before', 'after', 'on', 'between'
        date_value: Date to compare against (format: YYYY-MM-DD)
        date_value_end: End date for 'between' operator (format: YYYY-MM-DD)
        limit: Maximum number of results
    
    Returns:
        Dict with success status and list of prompts or error
    """
    attempt = 0
    while attempt < MAX_RETRIES:
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                
                query = "SELECT * FROM saved_prompts WHERE 1=1"
                params = []
                
                if search_text:
                    search_pattern = f"%{search_text}%"
                    
                    if search_fields and len(search_fields) > 0:
                        field_mapping = {
                            'name': 'name',
                            'description': 'description',
                            'role': 'role_prompt',
                            'task': 'task_prompt',
                            'context': 'context_prompt',
                            'format': 'format_prompt',
                            'constraints': 'constraints_prompt',
                            'tags': 'tags'
                        }
                        
                        valid_fields = []
                        for field in search_fields:
                            if field in field_mapping:
                                valid_fields.append(field_mapping[field])
                        
                        if valid_fields:
                            conditions = " OR ".join([f"{field} LIKE ?" for field in valid_fields])
                            query += f" AND ({conditions})"
                            params.extend([search_pattern] * len(valid_fields))
                    else:
                        if search_in == "name":
                            query += " AND name LIKE ?"
                            params.append(search_pattern)
                        elif search_in == "body":
                            query += """ AND (
                                role_prompt LIKE ? OR 
                                task_prompt LIKE ? OR 
                                context_prompt LIKE ? OR 
                                format_prompt LIKE ? OR 
                                constraints_prompt LIKE ?
                            )"""
                            params.extend([search_pattern] * 5)
                        else:
                            query += """ AND (
                                name LIKE ? OR
                                role_prompt LIKE ? OR 
                                task_prompt LIKE ? OR 
                                context_prompt LIKE ? OR 
                                format_prompt LIKE ? OR 
                                constraints_prompt LIKE ?
                            )"""
                            params.extend([search_pattern] * 6)
                
                if tags:
                    query += " AND tags LIKE ?"
                    params.append(f"%{tags}%")
                
                if created_by:
                    query += " AND created_by = ?"
                    params.append(created_by)
                
                if date_operator and date_value:
                    if date_operator == "before":
                        query += " AND DATE(created_at) < DATE(?)"
                        params.append(date_value)
                    elif date_operator == "after":
                        query += " AND DATE(created_at) > DATE(?)"
                        params.append(date_value)
                    elif date_operator == "on":
                        query += " AND DATE(created_at) = DATE(?)"
                        params.append(date_value)
                    elif date_operator == "between" and date_value_end:
                        query += " AND DATE(created_at) BETWEEN DATE(?) AND DATE(?)"
                        params.extend([date_value, date_value_end])
                
                query += " ORDER BY created_at DESC LIMIT ?"
                params.append(limit)
                
                cursor.execute(query, params)
                rows = cursor.fetchall()
                
                prompts = [dict(row) for row in rows]
                logger.info(f"Search returned {len(prompts)} results")
                
                return {
                    "success": True,
                    "prompts": prompts,
                    "count": len(prompts)
                }
        except sqlite3.OperationalError as e:
            if any(err in str(e).lower() for err in RETRYABLE_ERRORS):
                attempt += 1
                logger.warning(f"Database locked, retry {attempt}/{MAX_RETRIES}: {e}")
                time.sleep(RETRY_DELAY * attempt)
            else:
                logger.error(f"Non-retryable database error: {e}")
                return {"success": False, "error": str(e)}
        except Exception as e:
            logger.error(f"Error searching prompts: {e}")
            return {"success": False, "error": str(e)}
    
    return {"success": False, "error": "Database is busy, please try again"}

def get_prompt_by_id(prompt_id: int) -> Dict[str, Any]:
    """
    Get a specific prompt by ID and increment its use count.
    
    Args:
        prompt_id: ID of the prompt to retrieve
    
    Returns:
        Dict with success status and prompt data or error
    """
    attempt = 0
    while attempt < MAX_RETRIES:
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                
                cursor.execute("""
                    UPDATE saved_prompts 
                    SET use_count = use_count + 1,
                        last_used_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                """, (prompt_id,))
                
                cursor.execute("SELECT * FROM saved_prompts WHERE id = ?", (prompt_id,))
                row = cursor.fetchone()
                
                if row:
                    logger.info(f"Retrieved prompt ID {prompt_id}")
                    return {
                        "success": True,
                        "prompt": dict(row)
                    }
                else:
                    return {
                        "success": False,
                        "error": "Prompt not found"
                    }
        except sqlite3.OperationalError as e:
            if any(err in str(e).lower() for err in RETRYABLE_ERRORS):
                attempt += 1
                logger.warning(f"Database locked, retry {attempt}/{MAX_RETRIES}: {e}")
                time.sleep(RETRY_DELAY * attempt)
            else:
                logger.error(f"Non-retryable database error: {e}")
                return {"success": False, "error": str(e)}
        except Exception as e:
            logger.error(f"Error retrieving prompt: {e}")
            return {"success": False, "error": str(e)}
    
    return {"success": False, "error": "Database is busy, please try again"}

def delete_prompt(prompt_id: int) -> Dict[str, Any]:
    """
    Delete a prompt by ID.
    
    Args:
        prompt_id: ID of the prompt to delete
    
    Returns:
        Dict with success status and message or error
    """
    attempt = 0
    while attempt < MAX_RETRIES:
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM saved_prompts WHERE id = ?", (prompt_id,))
                
                if cursor.rowcount > 0:
                    logger.info(f"Deleted prompt ID {prompt_id}")
                    return {
                        "success": True,
                        "message": "Prompt deleted successfully"
                    }
                else:
                    return {
                        "success": False,
                        "error": "Prompt not found"
                    }
        except sqlite3.OperationalError as e:
            if any(err in str(e).lower() for err in RETRYABLE_ERRORS):
                attempt += 1
                logger.warning(f"Database locked, retry {attempt}/{MAX_RETRIES}: {e}")
                time.sleep(RETRY_DELAY * attempt)
            else:
                logger.error(f"Non-retryable database error: {e}")
                return {"success": False, "error": str(e)}
        except Exception as e:
            logger.error(f"Error deleting prompt: {e}")
            return {"success": False, "error": str(e)}
    
    return {"success": False, "error": "Database is busy, please try again"}

init_prompts_table()

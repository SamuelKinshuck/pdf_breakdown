from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any
from datetime import datetime

DSLNode = Dict[str, Any]      # alias for clarity

@dataclass
class Message:
    time: datetime
    level: str                 # "INFO" | "WARN" | "ERROR"
    node: DSLNode              # <-- was `message: str`


@dataclass
class JobState:
    job_id: str
    status: str  # PENDING, RUNNING, DONE, ERROR, ALREADY_DONE
    message: str = ""  # this is just the latest message
    progress: float = 0.0
    input_folder: str = ""
    output_folder: str = ""
    csv_name: str = ""
    csv_server_relative_url: Optional[str] = None
    error: Optional[str] = None
    traceback: Optional[str] = None
    rows_processed: int = 0
    total_files: int = 0
    created_at: datetime = field(default_factory=datetime.now)
    so_far_csv_name: str = ""
    messages: List[Message] = field(default_factory=list)
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, Optional

class RuleSeverity(str, Enum):
    BLOCKING = "BLOCKING"
    WARNING = "WARNING"
    INFO = "INFO"

@dataclass
class RuleResult:
    rule_id: str
    severity: RuleSeverity
    message_key: str
    message_params: Dict[str, Any] = field(default_factory=dict)


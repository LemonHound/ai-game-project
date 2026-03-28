from pydantic import BaseModel
from typing import Optional, List, Any, Dict
from datetime import datetime

class GameInfo(BaseModel):
    id: str
    name: str
    description: str
    icon: str
    difficulty: str
    players: int
    status: str
    category: str
    tags: List[str]

class StartGameRequest(BaseModel):
    userId: Optional[int] = None
    difficulty: str = 'medium'
    playerStarts: bool = True

class MoveRequest(BaseModel):
    gameSessionId: str
    move: Any
    userId: Optional[int] = None

class TttNewGameRequest(BaseModel):
    player_starts: bool = True

class TttMoveRequest(BaseModel):
    position: int

class CompleteGameRequest(BaseModel):
    gameSessionId: str
    moveSequence: str
    winner: str
    totalMoves: int
    finalScore: int = 0
    userId: Optional[int] = None

class TrainAIRequest(BaseModel):
    gameType: str
    boardState: str
    moveCount: int
    rating: Optional[float] = 0.0
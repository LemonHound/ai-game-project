// basic-chess-ai.js - Simple placeholder AI for chess
class BasicChessAI {
    constructor(game) {
        this.game = game;
        this.pieceValues = {
            'p': 1, 'n': 3, 'b': 3, 'r': 5, 'q': 9, 'k': 0,
            'P': 1, 'N': 3, 'B': 3, 'R': 5, 'Q': 9, 'K': 0
        };
    }

    makeMove(color) {
        const delay = Math.random() * 1500 + 500; // 0.5-2 seconds

        setTimeout(() => {
            const move = this.selectMove(color);
            if (move) {
                this.game.makeMove(move.fromRow, move.fromCol, move.toRow, move.toCol);
            }
        }, delay);
    }

    selectMove(color) {
        const isWhite = color === 'white';

        // 1. Look for attacks, prioritize highest value targets
        const attackMove = this.findBestAttack(color);
        if (attackMove) return attackMove;

        // 2. Move d/e pawns if still on starting ranks
        const pawnMove = this.moveCenterPawns(color);
        if (pawnMove) return pawnMove;

        // 3. Develop knights and bishops
        const developMove = this.developPieces(color);
        if (developMove) return developMove;

        // 4. Castle if possible
        const castleMove = this.tryCastle(color);
        if (castleMove) return castleMove;

        // 5. Random safe move
        return this.findRandomSafeMove(color);
    }

    findBestAttack(color) {
        let bestMove = null;
        let bestValue = 0;

        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = this.game.board[row][col];
                if (piece && this.game.isWhitePiece(piece) === (color === 'white')) {
                    const moves = this.game.getValidMoves(row, col);

                    for (const [toRow, toCol] of moves) {
                        const target = this.game.board[toRow][toCol];
                        if (target) {
                            const value = this.pieceValues[target.toLowerCase()];
                            if (value > bestValue) {
                                bestValue = value;
                                bestMove = { fromRow: row, fromCol: col, toRow, toCol };
                            }
                        }
                    }
                }
            }
        }

        return bestMove;
    }

    moveCenterPawns(color) {
        const isWhite = color === 'white';
        const pawnRow = isWhite ? 6 : 1;
        const centerCols = [3, 4]; // d and e files

        for (const col of centerCols) {
            const piece = this.game.board[pawnRow][col];
            if (piece && piece.toLowerCase() === 'p' && this.game.isWhitePiece(piece) === isWhite) {
                const moves = this.game.getValidMoves(pawnRow, col);
                const forwardMoves = moves.filter(([toRow]) =>
                    isWhite ? toRow < pawnRow : toRow > pawnRow
                );

                if (forwardMoves.length > 0) {
                    const move = forwardMoves[Math.floor(Math.random() * forwardMoves.length)];
                    return { fromRow: pawnRow, fromCol: col, toRow: move[0], toCol: move[1] };
                }
            }
        }

        return null;
    }

    developPieces(color) {
        const isWhite = color === 'white';
        const backRow = isWhite ? 7 : 0;
        const developPieces = ['n', 'b'];

        for (const pieceType of developPieces) {
            for (let col = 0; col < 8; col++) {
                const piece = this.game.board[backRow][col];
                if (piece && piece.toLowerCase() === pieceType &&
                    this.game.isWhitePiece(piece) === isWhite) {

                    const moves = this.game.getValidMoves(backRow, col);
                    const safeMoves = moves.filter(([toRow, toCol]) =>
                        !this.isSquareUnderAttack(toRow, toCol, color)
                    );

                    if (safeMoves.length > 0) {
                        const move = safeMoves[Math.floor(Math.random() * safeMoves.length)];
                        return { fromRow: backRow, fromCol: col, toRow: move[0], toCol: move[1] };
                    }
                }
            }
        }

        return null;
    }

    tryCastle(color) {
        const [kingRow, kingCol] = this.game.kingPositions[color];
        const moves = this.game.getValidMoves(kingRow, kingCol);

        // Look for castling moves (king moves 2 squares)
        const castleMoves = moves.filter(([, toCol]) => Math.abs(toCol - kingCol) === 2);

        if (castleMoves.length > 0) {
            // Prefer kingside castling
            const kingsideCastle = castleMoves.find(([, toCol]) => toCol > kingCol);
            const move = kingsideCastle || castleMoves[0];
            return { fromRow: kingRow, fromCol: kingCol, toRow: move[0], toCol: move[1] };
        }

        return null;
    }

    findRandomSafeMove(color) {
        const allMoves = [];

        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = this.game.board[row][col];
                if (piece && this.game.isWhitePiece(piece) === (color === 'white')) {
                    const moves = this.game.getValidMoves(row, col);
                    const safeMoves = moves.filter(([toRow, toCol]) =>
                        !this.isSquareUnderAttack(toRow, toCol, color)
                    );

                    for (const [toRow, toCol] of safeMoves) {
                        allMoves.push({ fromRow: row, fromCol: col, toRow, toCol });
                    }
                }
            }
        }

        if (allMoves.length === 0) {
            // If no safe moves, just pick any legal move
            for (let row = 0; row < 8; row++) {
                for (let col = 0; col < 8; col++) {
                    const piece = this.game.board[row][col];
                    if (piece && this.game.isWhitePiece(piece) === (color === 'white')) {
                        const moves = this.game.getValidMoves(row, col);
                        for (const [toRow, toCol] of moves) {
                            allMoves.push({ fromRow: row, fromCol: col, toRow, toCol });
                        }
                    }
                }
            }
        }

        return allMoves.length > 0 ? allMoves[Math.floor(Math.random() * allMoves.length)] : null;
    }

    isSquareUnderAttack(row, col, defendingColor) {
        return this.game.isSquareAttacked(row, col, defendingColor);
    }
}
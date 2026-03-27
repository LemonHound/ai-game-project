import { test, expect } from "@playwright/test";

const BASE = "http://localhost:8000/api";

async function loginTestUser(request: any) {
  const res = await request.post(`${BASE}/auth/login`, {
    data: { email: "test@example.com", password: "test123" },
  });
  expect(res.ok()).toBeTruthy();
  return res;
}

test.describe("error-handling", () => {
  test("invalid_move_returns_board_state: 4xx for invalid move includes board_state", async ({
    request,
  }) => {
    const loginRes = await loginTestUser(request);
    const cookies = loginRes.headers()["set-cookie"];

    const startRes = await request.post(`${BASE}/game/tic-tac-toe/start`, {
      data: { difficulty: "easy", playerStarts: true },
      headers: { Cookie: cookies },
    });
    expect(startRes.ok()).toBeTruthy();
    const { session_id } = await startRes.json();

    const moveRes = await request.post(`${BASE}/game/tic-tac-toe/move`, {
      data: { gameSessionId: session_id, move: 999 },
      headers: { Cookie: cookies },
    });
    expect(moveRes.ok()).toBeFalsy();
    expect(moveRes.status()).toBe(400);
    const body = await moveRes.json();
    expect(body).toHaveProperty("detail");
    expect(body).toHaveProperty("board_state");
    expect(body.board_state).not.toBeNull();
  });

  test("session_recovery_endpoint_returns_board: GET session returns board_state", async ({
    request,
  }) => {
    const loginRes = await loginTestUser(request);
    const cookies = loginRes.headers()["set-cookie"];

    const startRes = await request.post(`${BASE}/game/tic-tac-toe/start`, {
      data: { difficulty: "easy", playerStarts: true },
      headers: { Cookie: cookies },
    });
    expect(startRes.ok()).toBeTruthy();
    const { session_id } = await startRes.json();

    const recoveryRes = await request.get(
      `${BASE}/game/tic-tac-toe/session/${session_id}`,
      { headers: { Cookie: cookies } }
    );
    expect(recoveryRes.ok()).toBeTruthy();
    const body = await recoveryRes.json();
    expect(body).toHaveProperty("board_state");
    expect(body.board_state).not.toBeNull();
  });

  test("session_recovery_404_unknown_session: unknown session_id returns 404", async ({
    request,
  }) => {
    const loginRes = await loginTestUser(request);
    const cookies = loginRes.headers()["set-cookie"];

    const res = await request.get(
      `${BASE}/game/tic-tac-toe/session/00000000-0000-0000-0000-000000000000`,
      { headers: { Cookie: cookies } }
    );
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty("detail");
    expect(body).toHaveProperty("board_state");
    expect(body.board_state).toBeNull();
  });

  test("unauth_game_start_rejected: unauthenticated start game returns 401", async ({
    request,
  }) => {
    const res = await request.post(`${BASE}/game/tic-tac-toe/start`, {
      data: { difficulty: "easy", playerStarts: true },
    });
    expect(res.status()).toBe(401);
  });

  test("game_endpoints_consistent_error_shape: game errors have detail + board_state", async ({
    request,
  }) => {
    const loginRes = await loginTestUser(request);
    const cookies = loginRes.headers()["set-cookie"];

    const notFoundRes = await request.get(
      `${BASE}/game/tic-tac-toe/session/00000000-0000-0000-0000-000000000000`,
      { headers: { Cookie: cookies } }
    );
    expect(notFoundRes.status()).toBe(404);
    const notFoundBody = await notFoundRes.json();
    expect(notFoundBody).toHaveProperty("detail");
    expect(notFoundBody).toHaveProperty("board_state");

    const unauthRes = await request.post(`${BASE}/game/tic-tac-toe/start`, {
      data: { difficulty: "easy", playerStarts: true },
    });
    expect(unauthRes.status()).toBe(401);
    const unauthBody = await unauthRes.json();
    expect(unauthBody).toHaveProperty("detail");
    expect(unauthBody).toHaveProperty("board_state");
  });
});

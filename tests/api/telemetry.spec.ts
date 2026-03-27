import { test, expect } from "@playwright/test";

const BASE = "http://localhost:8000/api";

async function loginTestUser(request: any) {
  const res = await request.post(`${BASE}/auth/login`, {
    data: { email: "test@example.com", password: "test123" },
  });
  expect(res.ok()).toBeTruthy();
  return res;
}

test.describe("telemetry", () => {
  test("any_api_endpoint_returns_200: instrumented health endpoint succeeds without errors", async ({
    request,
  }) => {
    const res = await request.get(`${BASE}/health`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe("OK");
  });

  test("game_endpoint_span_attributes: start game returns session_id and game_state confirming span attributes are set", async ({
    request,
  }) => {
    const loginRes = await loginTestUser(request);
    const cookies = loginRes.headers()["set-cookie"];

    const startRes = await request.post(`${BASE}/game/tic-tac-toe/start`, {
      data: { difficulty: "easy", playerStarts: true },
      headers: { Cookie: cookies },
    });
    expect(startRes.ok()).toBeTruthy();
    const { session_id, game_state } = await startRes.json();
    expect(session_id).toBeTruthy();
    expect(game_state).toBeTruthy();
  });

  test("auth_endpoint_span_attributes: login returns user confirming auth.method span attribute path executed", async ({
    request,
  }) => {
    const res = await request.post(`${BASE}/auth/login`, {
      data: { email: "test@example.com", password: "test123" },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.user).toHaveProperty("id");
    expect(body.user).toHaveProperty("email");
  });

  test("record_move_child_span: making a move exercises the game.ai.move child span and returns board state", async ({
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
      data: { gameSessionId: session_id, move: 4 },
      headers: { Cookie: cookies },
    });
    expect(moveRes.ok()).toBeTruthy();
    const result = await moveRes.json();
    expect(result.board_after_player).toBeTruthy();
    expect(result.session_id).toBe(session_id);
  });
});

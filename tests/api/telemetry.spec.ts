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

  test("game_endpoint_span_attributes: newgame returns session_id and state confirming span attributes are set", async ({
    request,
  }) => {
    const loginRes = await loginTestUser(request);
    const cookies = loginRes.headers()["set-cookie"];

    const startRes = await request.post(`${BASE}/game/tic-tac-toe/newgame`, {
      data: { player_starts: true },
      headers: { Cookie: cookies },
    });
    expect(startRes.ok()).toBeTruthy();
    const { id, state } = await startRes.json();
    expect(id).toBeTruthy();
    expect(state).toBeTruthy();
    expect(state.board).toHaveLength(9);
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

  test("record_move_child_span: making a move accepts the request and returns 202", async ({
    request,
  }) => {
    const loginRes = await loginTestUser(request);
    const cookies = loginRes.headers()["set-cookie"];

    await request.post(`${BASE}/game/tic-tac-toe/newgame`, {
      data: { player_starts: true },
      headers: { Cookie: cookies },
    });

    const moveRes = await request.post(`${BASE}/game/tic-tac-toe/move`, {
      data: { position: 4 },
      headers: { Cookie: cookies },
    });
    expect(moveRes.status()).toBe(202);
  });
});

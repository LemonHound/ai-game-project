"""API tests for SEO endpoints."""


def test_seo_robots_txt(client):
    response = client.get("/robots.txt")
    assert response.status_code == 200
    assert "User-agent" in response.text


def test_seo_sitemap_xml(client):
    response = client.get("/sitemap.xml")
    assert response.status_code == 200
    assert "urlset" in response.text or "xml" in response.text

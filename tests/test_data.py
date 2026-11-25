"""Data-set tests: the CMDB must stay internally consistent."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from validate import load, validate  # noqa: E402


@pytest.fixture(scope="module")
def data():
    return load(ROOT / "data" / "osi.json"), load(ROOT / "data" / "cmdb.json")


def test_data_is_valid(data):
    osi, cmdb = data
    assert validate(osi, cmdb) == []


def test_seven_layers(data):
    osi, _ = data
    assert [l["num"] for l in osi["layers"]] == [1, 2, 3, 4, 5, 6, 7]


def test_every_layer_has_sub_layers(data):
    osi, _ = data
    for layer in osi["layers"]:
        assert len(layer["sublayers"]) >= 3, layer["id"]


def test_every_layer_has_cis(data):
    osi, cmdb = data
    used = {c["layer"] for c in cmdb["cis"]}
    assert used == set(range(1, 8)), f"layers without CIs: {set(range(1, 8)) - used}"


def test_hosts_are_unique(data):
    _, cmdb = data
    ids = [h["id"] for h in cmdb["hosts"]]
    assert len(ids) == len(set(ids))


def test_validator_catches_broken_reference():
    osi = {"schema": "cmdb.osi/v1", "layers": [
        {"num": n, "id": f"l{n}", "name": "x", "discipline": "d", "color": "#fff",
         "summary": "s", "sublayers": [{"id": f"s{n}", "name": "s", "discipline": "d", "detail": "d"}]}
        for n in range(1, 8)
    ]}
    cmdb = {"schema": "cmdb/v1", "hosts": [{"id": "h1"}, {"id": "h2"}],
            "cis": [{"id": "c1", "name": "n", "layer": 3, "sublayer": "s1", "host": "h1"}],
            "links": []}
    errors = validate(osi, cmdb)
    assert any("disagrees with sub-layer" in e for e in errors)


def test_viewer_files_present():
    for rel in ("index.html", "app.js", "style.css",
                "vendor/three.module.js", "vendor/three.core.js",
                "vendor/addons/controls/OrbitControls.js"):
        assert (ROOT / rel).is_file(), rel


def test_importmap_matches_vendor_files():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    assert "./vendor/three.module.js" in html
    assert "three/addons/" in html

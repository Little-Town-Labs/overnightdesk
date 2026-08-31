import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class HermesCoderImageTests(unittest.TestCase):
    def test_image_removes_inherited_docker_cli(self):
        dockerfile = (ROOT / "Dockerfile").read_text(encoding="utf-8")
        self.assertIn("apt-get purge -y docker-cli", dockerfile)
        self.assertIn("! command -v docker", dockerfile)


if __name__ == "__main__":
    unittest.main()

"""Integration tests for Video API endpoints.

Usage:
    python tests/test_video_api.py --token <JWT_TOKEN> [--url http://localhost:8000]
"""

import argparse
import asyncio
import io
import json
import logging
import sys
import time
from pathlib import Path
from typing import Optional

import httpx

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


class VideoAPITester:
    """Integration test suite for Video API."""

    def __init__(self, base_url: str, jwt_token: str):
        self.base_url = base_url.rstrip("/")
        self.jwt_token = jwt_token
        self.client = httpx.Client(
            headers={"Authorization": f"Bearer {jwt_token}"},
            timeout=60.0,
        )

    def __del__(self):
        self.client.close()

    def _print_section(self, title: str) -> None:
        """Print section header."""
        print("\n" + "━" * 70)
        print(f"  {title}")
        print("━" * 70)

    def _create_test_video(self, size_mb: int = 5) -> bytes:
        """Create a dummy video file for testing."""
        logger.info(f"Creating {size_mb}MB test video...")
        return b"\x00" * (size_mb * 1024 * 1024)

    def test_upload_without_processing(self) -> Optional[str]:
        """Test: Upload video without processing."""
        self._print_section("Test 1: Upload Without Processing")

        video_data = self._create_test_video(size_mb=2)

        try:
            response = self.client.post(
                f"{self.base_url}/api/v1/video/upload",
                files={"file": ("test_video.mp4", io.BytesIO(video_data))},
            )
            response.raise_for_status()

            result = response.json()
            print(f"\nResponse Status: {response.status_code}")
            print(f"Response Body:\n{json.dumps(result, indent=2)}")

            file_id = result.get("file_id")
            request_id = result.get("request_id")

            if not file_id:
                logger.error("✗ Upload failed: file_id not in response")
                return None

            print(f"\n✓ Upload successful")
            print(f"  request_id: {request_id}")
            print(f"  file_id:    {file_id}")
            print(f"  filename:   {result.get('filename')}")

            return file_id

        except httpx.HTTPError as e:
            logger.error(f"✗ Upload failed: {e}")
            return None

    def test_upload_with_processing(self) -> Optional[str]:
        """Test: Upload video with frame adjustment processing."""
        self._print_section("Test 2: Upload With Frame Adjustments")

        video_data = self._create_test_video(size_mb=2)

        frame_adjustments = {
            "brightness": 1.3,
            "contrast": 1.2,
            "saturation": 1.0,
            "hue": 0,
            "blur": 0,
        }

        try:
            response = self.client.post(
                f"{self.base_url}/api/v1/video/upload",
                files={
                    "file": ("test_video_processed.mp4", io.BytesIO(video_data)),
                    "process_video": (None, "true"),
                    "frame_adjustments": (None, json.dumps(frame_adjustments)),
                },
            )
            response.raise_for_status()

            result = response.json()
            print(f"\nResponse Status: {response.status_code}")
            print(f"Response Body:\n{json.dumps(result, indent=2)}")

            task_id = result.get("task_id")
            file_id = result.get("file_id")

            if not task_id or not file_id:
                logger.error("✗ Upload with processing failed: missing task_id or file_id")
                return None

            print(f"\n✓ Upload with processing successful")
            print(f"  file_id:   {file_id}")
            print(f"  task_id:   {task_id}")
            print(f"  message:   {result.get('message')}")

            return task_id

        except httpx.HTTPError as e:
            logger.error(f"✗ Upload with processing failed: {e}")
            return None

    def test_task_status_immediate(self, task_id: str) -> Optional[str]:
        """Test: Check task status immediately after enqueue."""
        self._print_section("Test 3: Task Status (Immediate Check)")

        try:
            response = self.client.get(f"{self.base_url}/api/v1/video/task/{task_id}")
            response.raise_for_status()

            result = response.json()
            print(f"\nResponse Status: {response.status_code}")
            print(f"Response Body:\n{json.dumps(result, indent=2)}")

            state = result.get("state")
            print(f"\n✓ Task status retrieved")
            print(f"  task_id: {task_id}")
            print(f"  state:   {state}")

            return state

        except httpx.HTTPError as e:
            logger.error(f"✗ Task status check failed: {e}")
            return None

    def test_task_polling(self, task_id: str, max_wait_seconds: int = 60) -> bool:
        """Test: Poll task status until completion or timeout."""
        self._print_section(f"Test 4: Task Polling (max {max_wait_seconds}s)")

        start_time = time.time()
        poll_interval = 2  # seconds
        poll_count = 0

        while time.time() - start_time < max_wait_seconds:
            poll_count += 1
            elapsed = int(time.time() - start_time)

            try:
                response = self.client.get(f"{self.base_url}/api/v1/video/task/{task_id}")
                response.raise_for_status()

                result = response.json()
                state = result.get("state")

                print(f"\nPoll #{poll_count} (elapsed: {elapsed}s)")
                print(f"  state: {state}")

                if state == "success":
                    print(f"\n✓ Task completed successfully!")
                    print(f"\nFinal Result:")
                    print(json.dumps(result.get("result"), indent=2))
                    return True

                elif state == "failed":
                    print(f"\n✗ Task failed!")
                    print(f"\nError:")
                    print(result.get("error"))
                    return False

                else:
                    print(f"  waiting {poll_interval}s...")
                    time.sleep(poll_interval)

            except httpx.HTTPError as e:
                logger.error(f"✗ Poll failed: {e}")
                return False

        print(f"\n⚠ Task did not complete within {max_wait_seconds}s timeout")
        return False

    def test_invalid_frame_adjustments(self) -> bool:
        """Test: Validate frame adjustment constraints."""
        self._print_section("Test 5: Invalid Frame Adjustments (Validation)")

        video_data = self._create_test_video(size_mb=1)

        # Test with out-of-range values
        invalid_adjustments = {
            "brightness": 5.0,  # Should fail: max 2.0
            "contrast": 0.1,    # Should fail: min 0.5
            "saturation": 1.0,
            "hue": 0,
            "blur": 0,
        }

        try:
            response = self.client.post(
                f"{self.base_url}/api/v1/video/upload",
                files={
                    "file": ("test_invalid.mp4", io.BytesIO(video_data)),
                    "process_video": (None, "true"),
                    "frame_adjustments": (None, json.dumps(invalid_adjustments)),
                },
            )

            if response.status_code == 400:
                print(f"\n✓ Validation correctly rejected invalid adjustments")
                print(f"  Status: {response.status_code}")
                print(f"  Error: {response.json().get('detail')}")
                return True
            else:
                print(f"\n✗ Expected 400 status, got {response.status_code}")
                print(f"  Response: {response.json()}")
                return False

        except httpx.HTTPError as e:
            logger.error(f"✗ Test failed: {e}")
            return False

    def test_missing_authentication(self) -> bool:
        """Test: Verify authentication is required."""
        self._print_section("Test 6: Authentication (Missing Token)")

        video_data = self._create_test_video(size_mb=1)

        # Make request without auth header
        client_no_auth = httpx.Client(timeout=60.0)

        try:
            response = client_no_auth.post(
                f"{self.base_url}/api/v1/video/upload",
                files={"file": ("test_video.mp4", io.BytesIO(video_data))},
            )

            if response.status_code == 401:
                print(f"\n✓ Authentication correctly enforced")
                print(f"  Status: {response.status_code}")
                return True
            else:
                print(f"\n✗ Expected 401 status, got {response.status_code}")
                return False

        except httpx.HTTPError as e:
            logger.error(f"✗ Test failed: {e}")
            return False

        finally:
            client_no_auth.close()

    def run_all(self) -> bool:
        """Run all integration tests."""
        print("\n" + "=" * 70)
        print("  VIDEO API INTEGRATION TEST SUITE")
        print("=" * 70)
        print(f"\nBase URL: {self.base_url}")
        print(f"JWT Token: {self.jwt_token[:20]}...")

        results = {}

        # Test 1: Upload without processing
        file_id = self.test_upload_without_processing()
        results["upload_without_processing"] = file_id is not None

        # Test 2: Upload with processing
        task_id = self.test_upload_with_processing()
        results["upload_with_processing"] = task_id is not None

        # Test 3: Task status (immediate)
        if task_id:
            state = self.test_task_status_immediate(task_id)
            results["task_status_immediate"] = state is not None

            # Test 4: Task polling
            success = self.test_task_polling(task_id, max_wait_seconds=60)
            results["task_polling"] = success

        # Test 5: Invalid adjustments
        results["validation"] = self.test_invalid_frame_adjustments()

        # Test 6: Missing auth
        results["authentication"] = self.test_missing_authentication()

        # Summary
        self._print_section("Test Summary")
        passed = sum(1 for v in results.values() if v)
        total = len(results)

        for test_name, passed_flag in results.items():
            status = "✓ PASS" if passed_flag else "✗ FAIL"
            print(f"  {status:10} {test_name}")

        print(f"\nTotal: {passed}/{total} tests passed")
        print("=" * 70 + "\n")

        return passed == total


def main():
    parser = argparse.ArgumentParser(
        description="Video API Integration Tests",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python tests/test_video_api.py --token abc123xyz --url http://localhost:8000
  python tests/test_video_api.py --token $JWT_TOKEN --url https://quickaishort-api.run.app
        """,
    )
    parser.add_argument("--token", required=True, help="JWT authentication token")
    parser.add_argument(
        "--url",
        default="http://localhost:8000",
        help="Base URL of FastAPI server (default: http://localhost:8000)",
    )

    args = parser.parse_args()

    try:
        tester = VideoAPITester(args.url, args.token)
        success = tester.run_all()
        sys.exit(0 if success else 1)

    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()

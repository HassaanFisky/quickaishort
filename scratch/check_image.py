from PIL import Image
import os

input_path = r'e:\QuickAI Short orignal\frontend\public\qs-logo.png'
output_path = r'e:\QuickAI Short orignal\frontend\public\qs-logo-optimized.png'

with Image.open(input_path) as img:
    # Try 768x768
    resized_img = img.resize((768, 768), Image.Resampling.LANCZOS)
    resized_img.save(output_path, "PNG", optimize=True, compress_level=9)

original_size = os.path.getsize(input_path)
new_size = os.path.getsize(output_path)

print(f"Original file size: {original_size / 1024 / 1024:.2f} MB")
print(f"New file size: {new_size / 1024 / 1024:.2f} MB")

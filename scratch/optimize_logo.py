from PIL import Image
import os

input_path = r'e:\QuickAI Short orignal\frontend\public\qs-logo.png'
temp_path = r'e:\QuickAI Short orignal\frontend\public\qs-logo-temp.png'

print(f"Opening {input_path}...")
with Image.open(input_path) as img:
    # Use quantization to 256 colors to drastically reduce size while keeping 1024x1024
    print("Quantizing image...")
    optimized_img = img.convert("RGBA").quantize(colors=256, method=2)
    print(f"Saving to {temp_path}...")
    optimized_img.save(temp_path, "PNG", optimize=True)

if os.path.exists(temp_path):
    orig_size = os.path.getsize(input_path)
    new_size = os.path.getsize(temp_path)
    print(f"Original size: {orig_size / 1024:.2f} KB")
    print(f"New size: {new_size / 1024:.2f} KB")
    
    # Backup original and replace
    backup_path = input_path + ".bak"
    if os.path.exists(backup_path):
        os.remove(backup_path)
    os.rename(input_path, backup_path)
    os.rename(temp_path, input_path)
    print("Done! Logo optimized successfully.")
else:
    print("Error: Optimized file was not created.")

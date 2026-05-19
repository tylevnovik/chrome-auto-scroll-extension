import os
import sys

def install_and_import():
    global Image, ImageDraw
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        import subprocess
        import sys
        print("Installing pillow...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pillow"])
        from PIL import Image, ImageDraw

# Ensure Pillow is installed
install_and_import()

from PIL import Image, ImageDraw

def create_scroll_icon(size):
    # Create an image with transparent background
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    
    # Scale coordinates based on size
    scale = size / 128.0
    
    # We want to draw a glowing double chevron pointing down: >> rotated or v-shapes
    # Outer circle/container background (soft dark glass circle)
    center = size / 2.0
    radius = 58 * scale
    
    # Draw soft circle backing
    draw.ellipse(
        [center - radius, center - radius, center + radius, center + radius],
        fill=(18, 12, 36, int(0.85 * 255)),
        outline=(124, 77, 255, int(0.4 * 255)),
        width=int(max(1, 3 * scale))
    )
    
    # Draw double chevrons pointing down
    # Chevron 1 (Top)
    # Line thickness
    thickness = int(max(2, 8 * scale))
    
    # Chevron 1 points: left, center, right
    y_offset1 = -10 * scale
    p1_left = (center - 32 * scale, center + y_offset1 - 12 * scale)
    p1_mid = (center, center + y_offset1 + 16 * scale)
    p1_right = (center + 32 * scale, center + y_offset1 - 12 * scale)
    
    # Draw Chevron 1 (Gradient / Glowing Violet-Cyan)
    draw.line([p1_left, p1_mid, p1_right], fill=(0, 229, 255, 255), width=thickness, joint="round")
    
    # Chevron 2 (Bottom)
    y_offset2 = 16 * scale
    p2_left = (center - 32 * scale, center + y_offset2 - 12 * scale)
    p2_mid = (center, center + y_offset2 + 16 * scale)
    p2_right = (center + 32 * scale, center + y_offset2 - 12 * scale)
    
    # Draw Chevron 2 (Glowing Indigo-Purple)
    draw.line([p2_left, p2_mid, p2_right], fill=(124, 77, 255, 255), width=thickness, joint="round")
    
    # Add a glowing dot at the very bottom chevron tip just for design flare
    dot_radius = 4 * scale
    if dot_radius > 1:
        draw.ellipse(
            [p2_mid[0] - dot_radius, p2_mid[1] + 6 * scale - dot_radius, 
             p2_mid[0] + dot_radius, p2_mid[1] + 6 * scale + dot_radius],
            fill=(0, 229, 255, 255)
        )
        
    return image

def main():
    sizes = [16, 48, 128]
    output_dir = os.path.dirname(os.path.abspath(__file__))
    
    print(f"Generating icons in: {output_dir}")
    for size in sizes:
        img = create_scroll_icon(size)
        filename = os.path.join(output_dir, f"icon{size}.png")
        img.save(filename, "PNG")
        print(f"Created {filename}")

if __name__ == "__main__":
    main()

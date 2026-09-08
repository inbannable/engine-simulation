"""Compose five paired mechanism/cutaway QA sheets; run with Python + Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
root=Path(__file__).resolve().parent.parent/'outputs/system-layers'
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',30) if Path('C:/Windows/Fonts/arial.ttf').exists() else ImageFont.load_default()
for name,title in [('01-air-turbo','Air intake / compressor / throttle / five runners'),('02-combustion-exhaust','Five combustion outlets / turbine / exhaust'),('03-lubrication','Oil supply / crank / head / turbo / return'),('04-cooling','Water pump / block / head / turbo / thermostat'),('05-dct-hydraulics','DCT pump / valve block / K1 K2 / four selector circuits')]:
    out=Image.new('RGB',(2400,960),(25,31,42));draw=ImageDraw.Draw(out)
    draw.text((28,18),title,font=font,fill='white')
    draw.text((28,70),'MECHANISM',font=font,fill='#9cdbed');draw.text((1228,70),'CUTAWAY - shell context',font=font,fill='#9cdbed')
    for i,suffix in enumerate(['','-cutaway']):out.paste(Image.open(root/(name+suffix+'.png')).resize((1200,840)),(i*1200,120))
    out.save(root/(name+'-qa.png'))


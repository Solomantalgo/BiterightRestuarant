import sys
import subprocess

try:
    import PyPDF2
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "PyPDF2"])
    import PyPDF2

def extract_pdf_text(filepath):
    text = ""
    with open(filepath, "rb") as f:
        reader = PyPDF2.PdfReader(f)
        for page in reader.pages:
            text += page.extract_text() + "\n"
    return text

if __name__ == "__main__":
    if len(sys.argv) > 1:
        text = extract_pdf_text(sys.argv[1])
        with open("scratch_pdf_output.txt", "w", encoding="utf-8") as f:
            f.write(text)
    else:
        print("Please provide a PDF file path")

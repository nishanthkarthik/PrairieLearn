import lxml.html
import prairielearn as pl
import chevron
import json
import base64
from pathlib import Path


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(element, ["name"], ["width", "height", "file"])


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    with open("pl-excalidraw.mustache", "r", encoding="utf-8") as template:
        drawing_name = pl.get_string_attrib(element, "name")
        submission = ""
        if data["panel"] == "answer" and pl.has_attrib(element, "file"):
            file = Path(data["options"]["question_path"]) / pl.get_string_attrib(element, "file")
            assert file.exists()
            submission = file.read_text(encoding="utf-8")
        else:
            submission = data["submitted_answers"].get(drawing_name, "")
        bytes = json.dumps({
            "panel": data["panel"],
            "submission": submission,
        }).encode()
        return chevron.render(template, {
            "uuid": pl.get_uuid(),
            "name": drawing_name,
            "width": pl.get_string_attrib(element, "width", "100%"),
            "height": pl.get_string_attrib(element, "height", "800px"),
            "metadata": base64.b64encode(bytes).decode()
        })


def parse(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    drawing_name = pl.get_string_attrib(element, "name")

    def append_errors(error_msg):
        if drawing_name not in data["format_errors"]:
            data["format_errors"][drawing_name] = []
        data["format_errors"][drawing_name] = data["format_errors"][drawing_name].append(error_msg)

    if drawing_name not in data["submitted_answers"]:
        append_errors(f"No submission found for pl-excalidraw element {drawing_name}")
    try:
        json.loads(data["submitted_answers"][drawing_name])
    except Exception as e:
        append_errors(f"Invalid drawing submission: {e}")

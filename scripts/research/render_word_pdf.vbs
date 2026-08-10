Option Explicit

If WScript.Arguments.Count <> 2 Then
  WScript.Echo "Usage: cscript render_word_pdf.vbs input.docx output.pdf"
  WScript.Quit 2
End If

Dim inputPath, outputPath, word, doc
inputPath = WScript.Arguments(0)
outputPath = WScript.Arguments(1)

On Error Resume Next
Set word = CreateObject("Word.Application")
If Err.Number <> 0 Then
  WScript.Echo "CREATE_ERROR " & Hex(Err.Number) & " " & Err.Description
  WScript.Quit 3
End If

word.Visible = False
word.DisplayAlerts = 0
Set doc = word.Documents.Open(inputPath, False, True)
If Err.Number <> 0 Then
  WScript.Echo "OPEN_ERROR " & Hex(Err.Number) & " " & Err.Description
  word.Quit
  WScript.Quit 4
End If

Err.Clear
doc.ExportAsFixedFormat outputPath, 17
If Err.Number <> 0 Then
  WScript.Echo "EXPORT_ERROR " & Hex(Err.Number) & " " & Err.Description
  doc.Close False
  word.Quit
  WScript.Quit 5
End If

doc.Close False
word.Quit
WScript.Echo "OK " & outputPath

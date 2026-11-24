using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Drawing;
using System.Windows.Forms;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using System.Windows.Automation;

internal static class R7AssistantUI {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr window, uint flags);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint current, uint other, bool attach);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
  [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr window, int command);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr window,int command);
  [DllImport("user32.dll")] static extern bool RedrawWindow(IntPtr window,IntPtr rectangle,IntPtr region,uint flags);
  [StructLayout(LayoutKind.Sequential)] struct WindowRect {public int left,top,right,bottom;}
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window,out WindowRect rectangle);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr window,IntPtr after,int x,int y,int width,int height,uint flags);
  delegate IntPtr WindowSubclass(IntPtr window,uint message,IntPtr wParam,IntPtr lParam,UIntPtr id,UIntPtr data);
  [DllImport("comctl32.dll")] static extern bool SetWindowSubclass(IntPtr window,WindowSubclass callback,UIntPtr id,UIntPtr data);
  [DllImport("comctl32.dll")] static extern bool RemoveWindowSubclass(IntPtr window,WindowSubclass callback,UIntPtr id);
  [DllImport("comctl32.dll")] static extern IntPtr DefSubclassProc(IntPtr window,uint message,IntPtr wParam,IntPtr lParam);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] static extern IntPtr GetDlgItem(IntPtr window, int id);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr SendMessage(IntPtr window,uint message,IntPtr wParam,string value);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr window,uint message,IntPtr wParam,IntPtr lParam);
  [DllImport("user32.dll",EntryPoint="SetWindowLongPtrW")] static extern IntPtr SetWindowOwner64(IntPtr window,int index,IntPtr value);
  [DllImport("user32.dll",EntryPoint="SetWindowLongW")] static extern IntPtr SetWindowOwner32(IntPtr window,int index,IntPtr value);
  delegate void WinEventCallback(IntPtr hook, uint eventType, IntPtr window, int objectId, int childId, uint thread, uint time);
  [DllImport("user32.dll")] static extern IntPtr SetWinEventHook(uint first, uint last, IntPtr module, WinEventCallback callback, uint processId, uint threadId, uint flags);
  [DllImport("user32.dll")] static extern bool UnhookWinEvent(IntPtr hook);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr window, System.Text.StringBuilder name, int length);
  [DllImport("kernel32.dll")] static extern uint GetTickCount();
  static Action<long> saveDialogShown;
  static Action<long> saveDialogPainted;
  static Action<string,long> savePhase;
  static void Phase(string name){if(savePhase!=null)savePhase(name,(long)(DateTime.UtcNow-new DateTime(1970,1,1)).TotalMilliseconds); }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  sealed class OpenFileName {
    public int size;
    public IntPtr owner, instance;
    public string filter, customFilter;
    public int maxCustomFilter, filterIndex;
    public IntPtr file;
    public int maxFile;
    public IntPtr fileTitle;
    public int maxFileTitle;
    public string initialDirectory, title;
    public int flags;
    public short fileOffset, extensionOffset;
    public string defaultExtension;
    public IntPtr customData, hook;
    public string template;
    public IntPtr reserved;
    public int reservedFlags, flagsEx;
  }
  [DllImport("comdlg32.dll", EntryPoint="GetSaveFileNameW", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern bool GetSaveFileName([In,Out] OpenFileName options);
  [DllImport("comdlg32.dll")] static extern uint CommDlgExtendedError();
  delegate IntPtr FileDialogHook(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
  [StructLayout(LayoutKind.Sequential)]
  struct WindowPosition { public IntPtr window, after; public int x,y,width,height; public uint flags; }
  sealed class PreparedDialogPool {
    public readonly System.Threading.ManualResetEvent Ready=new System.Threading.ManualResetEvent(false);
    readonly System.Threading.AutoResetEvent completed=new System.Threading.AutoResetEvent(false);
    public volatile Dictionary<string,string> Request;
    public IntPtr Window;
    object result;
    Exception error;
    public PreparedDialogPool(string extension) {
      var thread=new System.Threading.Thread(delegate(){
        var desktop=OpenInputDesktop(0,false,0x01ff);if(desktop!=IntPtr.Zero)SetThreadDesktop(desktop);
        var json=new JavaScriptSerializer{MaxJsonLength=16000000};
        var options=new Dictionary<string,string>{{"extension",extension},{"filename","Документ."+extension},{"alternatives",extension=="docx"?"{\"txt\":\"\"}":"{}"}};
        while(true){
          try{var value=FastSaveResult(options,json,this);Ready.Reset();Request=null;result=value;completed.Set();}
          catch(Exception failure){error=failure;Ready.Set();completed.Set();return;}
        }
      });
      thread.IsBackground=true;thread.SetApartmentState(System.Threading.ApartmentState.STA);thread.Start();
    }
    public object Choose(Dictionary<string,string> request){
      Ready.WaitOne();if(error!=null)throw error;
      Request=request;if(!PostMessage(Window,0x8001,IntPtr.Zero,IntPtr.Zero))throw new System.ComponentModel.Win32Exception();completed.WaitOne();if(error!=null)throw error;return result;
    }
  }
  static object FastSaveResult(Dictionary<string,string> data, JavaScriptSerializer json, PreparedDialogPool pool=null) {
    string extension=data["extension"], extra;
    var extensions=new List<string>();extensions.Add(extension);
    if(data.TryGetValue("alternatives",out extra))foreach(var entry in json.Deserialize<Dictionary<string,string>>(extra))if(!extensions.Contains(entry.Key))extensions.Add(entry.Key);
    var filter=new System.Text.StringBuilder();
    foreach(string ext in extensions){
      if(Array.IndexOf(new[]{"txt","png","jpg","pptx","docx"},ext)<0)throw new Exception("Unsupported extension");
      filter.Append(ext=="docx"?"Документ Word / Р7":ext=="txt"?"Обычный текст":ext=="pptx"?"Презентация PowerPoint / Р7":ext.ToUpperInvariant());
      filter.Append(" (*.").Append(ext).Append(")\0*.").Append(ext).Append('\0');
    }
    filter.Append('\0');
    var owner=pool!=null?null:FindR7Owner();if(owner!=null)ActivateOwner(owner.Handle);
    var options=new OpenFileName();options.size=Marshal.SizeOf(options);options.owner=owner==null?IntPtr.Zero:owner.Handle;
    options.filter=filter.ToString();options.filterIndex=1;
    options.file=Marshal.StringToHGlobalUni(Path.GetFileNameWithoutExtension(data["filename"]).PadRight(4095, '\0'));options.maxFile=4096;
    options.initialDirectory=Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
    options.title="AI Assistant — сохранить результат";
    // Keep the original Explorer-style system dialog (navigation sidebar and resizable file list).
    options.flags=0x2|0x4|0x8|0x800|0x80000|0x800000;
    FileDialogHook warmHook=null;
    WindowSubclass rootHook=null;
    IntPtr rootWindow=IntPtr.Zero;
    System.Windows.Forms.Timer warmTimer=null;
    bool visible=pool==null,preparedReady=false,nativeInitialized=false;
    Exception activationError=null;
    DateTime shownTime=DateTime.MinValue,initializedAt=DateTime.MaxValue;
    Action showPrepared=null;
    if(pool!=null){
      warmHook=delegate(IntPtr window,uint message,IntPtr wParam,IntPtr lParam){
        if(message==0x4E&&Marshal.ReadInt32(lParam,IntPtr.Size*2)==-601){nativeInitialized=true;initializedAt=DateTime.UtcNow;} // CDN_INITDONE
        if(message==0x110){
          rootWindow=GetAncestor(window,2);pool.Window=rootWindow; // Explorer hook is a child; subclass its real dialog.
          rootHook=delegate(IntPtr hwnd,uint msg,IntPtr wp,IntPtr lp,UIntPtr id,UIntPtr state){
            if(msg==0x8001){if(showPrepared!=null)showPrepared();return IntPtr.Zero;}
            if(msg==0x46&&!visible){
              var position=(WindowPosition)Marshal.PtrToStructure(lp,typeof(WindowPosition));
              position.flags=(position.flags&~0x40u)|0x10u;Marshal.StructureToPtr(position,lp,false);
            }
            return DefSubclassProc(hwnd,msg,wp,lp);
          };
          if(!SetWindowSubclass(rootWindow,rootHook,new UIntPtr(1),UIntPtr.Zero))throw new Exception("Не удалось подготовить системный диалог");
          showPrepared=delegate{
            if(pool.Request!=null&&!visible){
              try{
                Phase("find-owner");owner=FindR7Owner();Phase("owner-found");
                if(IntPtr.Size==8)SetWindowOwner64(rootWindow,-8,owner.Handle);else SetWindowOwner32(rootWindow,-8,owner.Handle);
                SendMessage(rootWindow,0x468,new IntPtr(0x480),Path.GetFileNameWithoutExtension(pool.Request["filename"])); // CDM_SETCONTROLTEXT
                visible=true;shownTime=DateTime.UtcNow;Phase("before-show");
                WindowRect hostRect,dialogRect;GetWindowRect(owner.Handle,out hostRect);GetWindowRect(rootWindow,out dialogRect);
                int width=dialogRect.right-dialogRect.left,height=dialogRect.bottom-dialogRect.top;
                SetWindowPos(rootWindow,IntPtr.Zero,hostRect.left+Math.Max(0,(hostRect.right-hostRect.left-width)/2),hostRect.top+Math.Max(0,(hostRect.bottom-hostRect.top-height)/2),0,0,0x1|0x40);
                ShowWindow(rootWindow,5);Phase("after-show");ActivateOwner(rootWindow);Phase("after-activate");
                RedrawWindow(rootWindow,IntPtr.Zero,IntPtr.Zero,0x1|0x80|0x100);
                Phase("visible-"+IsWindowVisible(rootWindow)+"-foreground-"+(GetForegroundWindow()==rootWindow));
                Phase("after-paint");if(saveDialogPainted!=null)saveDialogPainted((long)(DateTime.UtcNow-new DateTime(1970,1,1)).TotalMilliseconds);
                string testDelay;int milliseconds;if(pool.Request.TryGetValue("cancelAfterMs",out testDelay)&&Int32.TryParse(testDelay,out milliseconds)&&milliseconds>=100)warmTimer.Start();
              }catch(Exception failure){activationError=failure;PostMessage(rootWindow,0x111,new IntPtr(2),IntPtr.Zero);}
            }
          };
          warmTimer=new System.Windows.Forms.Timer();warmTimer.Interval=40;
          warmTimer.Tick+=delegate{
            if(!nativeInitialized||(DateTime.UtcNow-initializedAt).TotalMilliseconds<750)return;
            if(!preparedReady){preparedReady=true;pool.Ready.Set();warmTimer.Stop();}
            string cancelAfter;
            if(visible&&pool.Request!=null&&pool.Request.TryGetValue("cancelAfterMs",out cancelAfter)){
              int delay;if(Int32.TryParse(cancelAfter,out delay)&&(DateTime.UtcNow-shownTime).TotalMilliseconds>=delay){warmTimer.Stop();PostMessage(rootWindow,0x111,new IntPtr(2),IntPtr.Zero);}
            }
          };warmTimer.Start();
        }
        return IntPtr.Zero;
      };
      options.flags|=0x20;options.hook=Marshal.GetFunctionPointerForDelegate(warmHook);
    }
    try { while(true){
      bool chosen;using(var visibility=new DialogVisibility())chosen=GetSaveFileName(options);
      if(activationError!=null)throw activationError;
      if(!chosen){uint error=CommDlgExtendedError();if(error!=0)throw new Exception("Ошибка диалога сохранения: "+error);return new{ok=true,cancelled=true};}
      string path=Marshal.PtrToStringUni(options.file),ext=Path.GetExtension(path).TrimStart('.').ToLowerInvariant();
      string proposed=pool!=null&&pool.Request!=null?pool.Request["filename"]:data["filename"];
      if(String.IsNullOrEmpty(ext)||String.Equals(Path.GetFileName(path),Path.GetFileNameWithoutExtension(proposed),StringComparison.OrdinalIgnoreCase)){
        ext=extensions[Math.Max(0,Math.Min(extensions.Count-1,options.filterIndex-1))];path+="."+ext;
        if(File.Exists(path)&&MessageBox.Show(owner,"Файл уже существует. Заменить его?","AI Assistant",MessageBoxButtons.YesNo,MessageBoxIcon.Question)!=DialogResult.Yes)continue;
      }
      if(!extensions.Contains(ext)){MessageBox.Show(owner,"Выберите один из доступных типов файла.","AI Assistant",MessageBoxButtons.OK,MessageBoxIcon.Information);continue;}
      return new{ok=true,file=path,extension=ext};
    }} finally { if(warmTimer!=null)warmTimer.Dispose();if(rootHook!=null)RemoveWindowSubclass(rootWindow,rootHook,new UIntPtr(1));Marshal.FreeHGlobal(options.file);GC.KeepAlive(warmHook);GC.KeepAlive(rootHook); }
  }
  sealed class DialogVisibility : IDisposable {
    readonly WinEventCallback callback;
    readonly IntPtr hook;
    bool reported;
    public DialogVisibility() {
      callback = delegate(IntPtr h, uint e, IntPtr window, int objectId, int childId, uint thread, uint time) {
        if (reported || objectId != 0 || childId != 0) return;
        var name = new System.Text.StringBuilder(64);
        GetClassName(window, name, name.Capacity);
        if (name.ToString() != "#32770") return;
        reported = true;
        if (saveDialogShown != null) saveDialogShown((long)(DateTime.UtcNow-new DateTime(1970,1,1)).TotalMilliseconds-unchecked(GetTickCount()-time));
      };
      hook = SetWinEventHook(0x8002, 0x8002, IntPtr.Zero, callback, (uint)System.Diagnostics.Process.GetCurrentProcess().Id, GetCurrentThreadId(), 0);
    }
    public void Dispose() { if (hook != IntPtr.Zero) UnhookWinEvent(hook); GC.KeepAlive(callback); }
  }
  sealed class R7WindowOwner : IWin32Window {
    readonly IntPtr handle;
    public R7WindowOwner(IntPtr value) { handle = value; }
    public IntPtr Handle { get { return handle; } }
  }
  static bool IsR7Process(System.Diagnostics.Process process) {
    try {
      if (!String.Equals(process.ProcessName, "DesktopEditors", StringComparison.OrdinalIgnoreCase) &&
          !String.Equals(process.ProcessName, "editors", StringComparison.OrdinalIgnoreCase)) return false;
      var installation=R7Installation.Discover(null,Environment.GetEnvironmentVariable("R7_AI_DATA_DIR"));
      if(!Convert.ToBoolean(installation["ok"]))return false;
      string directory=Path.GetDirectoryName(Convert.ToString(installation["executable"]));
      return String.Equals(Path.GetDirectoryName(process.MainModule.FileName), directory, StringComparison.OrdinalIgnoreCase);
    } catch (System.ComponentModel.Win32Exception) { return false; }
      catch (InvalidOperationException) { return false; }
  }
  static List<System.Diagnostics.Process> R7Processes() {
    var result = new List<System.Diagnostics.Process>();
    foreach (string name in new[] { "DesktopEditors", "editors" }) {
      foreach (var process in System.Diagnostics.Process.GetProcessesByName(name)) {
        if (IsR7Process(process)) result.Add(process);
        else process.Dispose();
      }
    }
    return result;
  }
  static bool IsR7Window(IntPtr window) {
    if (window == IntPtr.Zero) return false;
    uint pid; GetWindowThreadProcessId(window, out pid);
    try {
      using (var process = System.Diagnostics.Process.GetProcessById((int)pid))
        return IsR7Process(process);
    } catch (ArgumentException) { return false; }
  }
  static R7WindowOwner FindR7Owner() {
    var foreground = GetAncestor(GetForegroundWindow(), 3); // GA_ROOTOWNER
    if (IsR7Window(foreground)) return new R7WindowOwner(foreground);
    foreach (var process in R7Processes()) {
      using (process) {
        var handle = process.MainWindowHandle;
        if (handle != IntPtr.Zero) return new R7WindowOwner(handle);
      }
    }
    throw new Exception("Не найдено окно Р7-Офис. Откройте редактор и повторите сохранение.");
  }
  static void ActivateOwner(IntPtr window) {
    if (IsIconic(window)) ShowWindowAsync(window, 9); // SW_RESTORE
    uint pid;
    uint foregroundThread = GetWindowThreadProcessId(GetForegroundWindow(), out pid);
    uint currentThread = GetCurrentThreadId();
    bool attached = foregroundThread != 0 && foregroundThread != currentThread && AttachThreadInput(currentThread, foregroundThread, true);
    try { SetForegroundWindow(window); }
    finally { if (attached) AttachThreadInput(currentThread, foregroundThread, false); }
  }
  [DllImport("user32.dll", SetLastError=true)] static extern IntPtr OpenInputDesktop(uint flags, bool inherit, uint access);
  [DllImport("user32.dll", SetLastError=true)] static extern bool SetThreadDesktop(IntPtr desktop);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern uint RegisterClipboardFormat(string name);
  [DllImport("user32.dll")] static extern bool OpenClipboard(IntPtr owner);
  [DllImport("user32.dll")] static extern bool CloseClipboard();
  [DllImport("user32.dll")] static extern IntPtr GetClipboardData(uint format);
  [DllImport("kernel32.dll")] static extern IntPtr GlobalLock(IntPtr handle);
  [DllImport("kernel32.dll")] static extern bool GlobalUnlock(IntPtr handle);
  [DllImport("kernel32.dll")] static extern UIntPtr GlobalSize(IntPtr handle);
  static string ReadHtml() {
    if(!OpenClipboard(IntPtr.Zero))throw new Exception("Clipboard busy");
    try {var handle=GetClipboardData(RegisterClipboardFormat("HTML Format"));if(handle==IntPtr.Zero)throw new Exception("Missing CF_HTML");var pointer=GlobalLock(handle);
      try {var bytes=new byte[(int)GlobalSize(handle).ToUInt64()];Marshal.Copy(pointer,bytes,0,bytes.Length);return System.Text.Encoding.UTF8.GetString(bytes).TrimEnd('\0');}finally{GlobalUnlock(handle);}
    }finally{CloseClipboard();}
  }
  static object SaveResult(Dictionary<string,string> data, JavaScriptSerializer json, bool chooseOnly) {
        if(chooseOnly)return FastSaveResult(data,json);
        string ext = data["extension"];
        if (Array.IndexOf(new[] { "txt", "png", "jpg", "pptx", "docx" }, ext) < 0) throw new Exception("Unsupported extension");
        var formats = new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);
        formats.Add(ext, data["data"]);
        string alternatives;
        if (data.TryGetValue("alternatives", out alternatives)) {
          foreach (var entry in json.Deserialize<Dictionary<string,string>>(alternatives)) {
            if (Array.IndexOf(new[] { "txt", "png", "jpg", "pptx", "docx" }, entry.Key) < 0) throw new Exception("Unsupported extension");
            formats[entry.Key] = entry.Value;
          }
        }
        var extensions = new List<string>(formats.Keys);
        var filters = new List<string>();
        foreach (string extension in extensions) {
          string label = extension == "docx" ? "Документ Word / Р7" : extension == "txt" ? "Обычный текст" : extension == "pptx" ? "Презентация PowerPoint / Р7" : extension.ToUpperInvariant();
          filters.Add(label + " (*." + extension + ")|*." + extension);
        }
        using (var dialog = new SaveFileDialog()) {
          // Own the dialog by the real R7 window, not an unrelated helper form.
          var owner = FindR7Owner();
          ActivateOwner(owner.Handle);
          dialog.Title = "AI Assistant — сохранить результат";
          string filename;
          dialog.FileName = data.TryGetValue("filename", out filename) && !String.IsNullOrWhiteSpace(filename)
            ? Path.GetFileName(filename) : "AI Assistant." + ext;
          // No fixed extension in a multi-format name: the selected native filter supplies it.
          if (formats.Count > 1) dialog.FileName = Path.GetFileNameWithoutExtension(dialog.FileName);
          dialog.DefaultExt = formats.Count > 1 ? "" : ext;
          dialog.AddExtension = true;
          dialog.Filter = String.Join("|", filters.ToArray());
          dialog.FilterIndex = extensions.IndexOf(ext) + 1;
          dialog.FileOk += delegate(object sender, System.ComponentModel.CancelEventArgs e) {
            string selected = Path.GetExtension(dialog.FileName).TrimStart('.');
            if (!formats.ContainsKey(selected)) {
              MessageBox.Show(owner, "Выберите один из доступных типов файла и используйте соответствующее расширение.", "AI Assistant", MessageBoxButtons.OK, MessageBoxIcon.Information);
              e.Cancel = true;
            }
          };
          dialog.OverwritePrompt = true;
          dialog.AutoUpgradeEnabled = false; dialog.InitialDirectory = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
          DialogResult selection;
          using (var visibility = new DialogVisibility()) selection = dialog.ShowDialog(owner);
          if (selection == DialogResult.OK) {
            string selected = Path.GetExtension(dialog.FileName).TrimStart('.');
            if (chooseOnly) return new { ok = true, file = dialog.FileName, extension = selected };
            byte[] selectedBytes = Convert.FromBase64String(formats[selected]);
            if (selectedBytes.Length > 12000000) throw new Exception("Result is too large");
            File.WriteAllBytes(dialog.FileName, selectedBytes);
            return new { ok = true, file = dialog.FileName };
          } else return new { ok = true, cancelled = true };
        }
  }
  [STAThread]
  static int Main(string[] args) {
    var json = new JavaScriptSerializer { MaxJsonLength = 16000000 };
    try {
      if(args.Length==1&&args[0]=="r7-installations") {
        using(var output=new StreamWriter(Console.OpenStandardOutput(),new System.Text.UTF8Encoding(false)))output.Write(json.Serialize(R7Installation.Discover(null,Environment.GetEnvironmentVariable("R7_AI_DATA_DIR"))));
        return 0;
      }
      if (args.Length == 1 && args[0] == "document-names") {
        var inputDesktop = OpenInputDesktop(0,false,0x01ff);
        if (inputDesktop != IntPtr.Zero) SetThreadDesktop(inputDesktop);
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var process in R7Processes()) {
          using (process) {
            var windows = AutomationElement.RootElement.FindAll(TreeScope.Children,
              new PropertyCondition(AutomationElement.ProcessIdProperty, process.Id));
            foreach (AutomationElement window in windows) {
              try {
                names.Add(window.Current.Name);
                var tabs = window.FindAll(TreeScope.Descendants,
                  new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.TabItem));
                foreach (AutomationElement tab in tabs) names.Add(tab.Current.Name);
              } catch (ElementNotAvailableException) { }
            }
          }
        }
        names.Remove("");
        using (var output = new StreamWriter(Console.OpenStandardOutput(), new System.Text.UTF8Encoding(false)))
          output.Write(json.Serialize(new List<string>(names)));
        return 0;
      }
      if (args.Length == 2 && args[0] == "peer") {
        int processId = Int32.Parse(args[1]);
        using (var process = System.Diagnostics.Process.GetProcessById(processId))
        using (var output = new StreamWriter(Console.OpenStandardOutput(), new System.Text.UTF8Encoding(false))) {
          output.Write(json.Serialize(new { path = process.MainModule.FileName, name = process.ProcessName }));
        }
        return 0;
      }
      var desktop = OpenInputDesktop(0,false,0x01ff);
      if (desktop != IntPtr.Zero) SetThreadDesktop(desktop);
      Application.EnableVisualStyles();
      if (args.Length == 1 && args[0] == "save-host") {
        using (var reader = new StreamReader(Console.OpenStandardInput(), new System.Text.UTF8Encoding(false)))
        using (var writer = new StreamWriter(Console.OpenStandardOutput(), new System.Text.UTF8Encoding(false))) {
          var pools=new Dictionary<string,List<PreparedDialogPool>>();
          foreach(string extension in new[]{"docx","pptx","png","jpg"}){var group=new List<PreparedDialogPool>();for(int i=0;i<2;i++)group.Add(new PreparedDialogPool(extension));pools.Add(extension,group);}
          foreach(var group in pools.Values)foreach(var pool in group)pool.Ready.WaitOne();
          writer.AutoFlush = true;
          writer.WriteLine(json.Serialize(new { ready = true }));
          saveDialogShown = delegate(long shownAt) { writer.WriteLine(json.Serialize(new { eventType = "dialog-shown", shownAt = shownAt })); };
          savePhase=delegate(string phase,long at){writer.WriteLine(json.Serialize(new{eventType="phase",phase=phase,at=at}));};
          saveDialogPainted = delegate(long paintedAt) { writer.WriteLine(json.Serialize(new { eventType = "dialog-painted", paintedAt = paintedAt })); };
          string line;
          while ((line = reader.ReadLine()) != null) {
            try { var request=json.Deserialize<Dictionary<string,string>>(line);var group=pools[request["extension"]];var selected=group[0];foreach(var candidate in group)if(candidate.Ready.WaitOne(0)&&candidate.Request==null){selected=candidate;break;}writer.WriteLine(json.Serialize(selected.Choose(request))); }
            catch (Exception error) { writer.WriteLine(json.Serialize(new { error = error.Message })); }
          }
        }
        return 0;
      }
      if(args.Length==1 && args[0]=="read-rich") {
        var html=ReadHtml();var text=Clipboard.GetText();using(var output=new StreamWriter(Console.OpenStandardOutput(),new System.Text.UTF8Encoding(false)))output.Write(json.Serialize(new {html=html,text=text}));return 0;
      }
      string input;
      if (args.Length != 2) throw new Exception("Input file is required");
      input = File.ReadAllText(args[1]);
      var data = json.Deserialize<Dictionary<string, string>>(input);
      byte[] bytes = Convert.FromBase64String(data["data"]);
      if (bytes.Length > 12000000) throw new Exception("Result is too large");
      object result;
      if (args.Length == 2 && args[0] == "clipboard") {
        using (var stream = new MemoryStream(bytes))
        using (var image = Image.FromStream(stream)) {
          if (image.Width > 8192 || image.Height > 8192 || (long)image.Width * image.Height > 16000000) throw new Exception("Image exceeds dimensions limit");
          Clipboard.SetImage(image);
        }
        result = new { ok = true };
      } else if (args.Length == 2 && args[0] == "clipboard-html") {
        var rich = json.Deserialize<Dictionary<string,string>>(System.Text.Encoding.UTF8.GetString(bytes));
        string fragment = rich["html"], prefix = "<html><head><meta charset=\"utf-8\"></head><body><!--StartFragment-->", suffix = "<!--EndFragment--></body></html>";
        string template = "Version:0.9\r\nStartHTML:{0:0000000000}\r\nEndHTML:{1:0000000000}\r\nStartFragment:{2:0000000000}\r\nEndFragment:{3:0000000000}\r\n";
        int start = System.Text.Encoding.UTF8.GetByteCount(String.Format(template,0,0,0,0)), from = start + System.Text.Encoding.UTF8.GetByteCount(prefix), to = from + System.Text.Encoding.UTF8.GetByteCount(fragment), end = to + System.Text.Encoding.UTF8.GetByteCount(suffix);
        string cfhtml = String.Format(template,start,end,from,to) + prefix + fragment + suffix;
        var content = new DataObject();content.SetData(DataFormats.Html,new MemoryStream(System.Text.Encoding.UTF8.GetBytes(cfhtml)));content.SetData(DataFormats.UnicodeText,rich["text"]);
        Clipboard.SetDataObject(content,true,5,100);
        result = new { ok = true, rich = true };
      } else if (args.Length == 2 && args[0] == "save") {
        result = SaveResult(data, json, false);
      } else throw new Exception("Unknown operation");
      using (var output = new StreamWriter(Console.OpenStandardOutput(), new System.Text.UTF8Encoding(false))) { output.Write(json.Serialize(result)); }
      return 0;
    } catch (Exception error) {
      using (var output = new StreamWriter(Console.OpenStandardError(), new System.Text.UTF8Encoding(false))) { output.Write(error.Message); }
      return 1;
    }
  }
}

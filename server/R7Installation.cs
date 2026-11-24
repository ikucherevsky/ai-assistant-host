using System;
using System.IO;
using System.Diagnostics;
using System.Collections.Generic;
using Microsoft.Win32;

// Shared by the native helper, tray and installer. Never trust a process name alone.
internal static class R7Installation {
  public static void SaveSettings(string directory,string executable=null){
    Directory.CreateDirectory(directory);object value=executable==null?(object)new{mode="auto"}:new{mode="explicit",executable=Validate(executable)};
    string file=Path.Combine(directory,"r7-settings.json"),temporary=Path.Combine(directory,"r7-settings-"+Guid.NewGuid().ToString("N")+".tmp");
    try{File.WriteAllText(temporary,new System.Web.Script.Serialization.JavaScriptSerializer().Serialize(value),new System.Text.UTF8Encoding(false));if(File.Exists(file))File.Replace(temporary,file,null);else File.Move(temporary,file);}finally{if(File.Exists(temporary))File.Delete(temporary);}
  }
  public static string Validate(string value) {
    if(String.IsNullOrWhiteSpace(value))throw new Exception("Не задан путь к Р7-Офис.");
    string expanded=Environment.ExpandEnvironmentVariables(value.Trim().Trim('"'));if(!Path.IsPathRooted(expanded))throw new Exception("Укажите полный путь к установке Р7-Офис.");
    string path=Path.GetFullPath(expanded);
    if(Directory.Exists(path))path=Path.Combine(path,"DesktopEditors.exe");
    if(String.Equals(Path.GetFileName(path),"editors.exe",StringComparison.OrdinalIgnoreCase))path=Path.Combine(Path.GetDirectoryName(path),"DesktopEditors.exe");
    if(!String.Equals(Path.GetFileName(path),"DesktopEditors.exe",StringComparison.OrdinalIgnoreCase)||!File.Exists(path))throw new Exception("Выберите существующий DesktopEditors.exe из каталога Р7-Офис.");
    string editor=Path.Combine(Path.GetDirectoryName(path),"editors.exe");
    if(!File.Exists(editor))throw new Exception("В каталоге установки отсутствует editors.exe.");
    foreach(string file in new[]{path,editor}){var info=FileVersionInfo.GetVersionInfo(file);string product=info.ProductName??"";
      if(product.IndexOf("Р7",StringComparison.OrdinalIgnoreCase)<0&&product.IndexOf("R7",StringComparison.OrdinalIgnoreCase)<0&&product.IndexOf("P7",StringComparison.OrdinalIgnoreCase)<0)throw new Exception("Файл не распознан как компонент Р7-Офис: "+Path.GetFileName(file));
    }
    return path;
  }
  static string ExecutableValue(string value){if(String.IsNullOrWhiteSpace(value))return "";value=value.Trim();if(value.StartsWith("\"")){int end=value.IndexOf('"',1);return end>1?value.Substring(1,end-1):"";}int icon=value.LastIndexOf(',');return icon>0?value.Substring(0,icon):value;}
  static void Add(Dictionary<string,string> found,string path,string source){try{string valid=Validate(path);if(!found.ContainsKey(valid))found.Add(valid,source);}catch{}}
  static void DirectoryCandidates(Dictionary<string,string> found,string directory,string source){if(String.IsNullOrWhiteSpace(directory))return;Add(found,directory,source);try{foreach(string child in Directory.GetDirectories(directory))Add(found,child,source);}catch{}}
  static readonly object cacheGate=new object();static string cacheKey;static DateTime cacheUntil;static Dictionary<string,object> cached;
  public static Dictionary<string,object> Discover(string explicitPath=null,string dataDirectory=null){
    string stamp="";try{stamp=File.GetLastWriteTimeUtc(Path.Combine(dataDirectory??"","r7-settings.json")).Ticks.ToString();}catch{}
    string key=explicitPath+"|"+dataDirectory+"|"+Environment.GetEnvironmentVariable("R7_EXE")+"|"+stamp;
    lock(cacheGate){if(cached!=null&&key==cacheKey&&DateTime.UtcNow<cacheUntil)return cached;cached=DiscoverFresh(explicitPath,dataDirectory);cacheKey=key;cacheUntil=DateTime.UtcNow.AddSeconds(2);return cached;}
  }
  static Dictionary<string,object> DiscoverFresh(string explicitPath,string dataDirectory){
    var found=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);string configured=explicitPath;bool automatic=false;
    if(String.IsNullOrWhiteSpace(configured)&&!String.IsNullOrWhiteSpace(dataDirectory))try{
      var settings=new System.Web.Script.Serialization.JavaScriptSerializer().Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(dataDirectory,"r7-settings.json")));
      object mode;if(!settings.TryGetValue("mode",out mode)||(Convert.ToString(mode)!="auto"&&Convert.ToString(mode)!="explicit"))throw new InvalidDataException("Неизвестный режим настройки Р7.");
      automatic=Convert.ToString(mode)=="auto";object exe;if(!automatic){if(!settings.TryGetValue("executable",out exe)||String.IsNullOrWhiteSpace(Convert.ToString(exe)))throw new InvalidDataException("Не задан путь к выбранной установке Р7.");configured=Convert.ToString(exe);}
    }catch(FileNotFoundException){}catch(DirectoryNotFoundException){}catch(Exception e){return new Dictionary<string,object>{{"ok",false},{"reason","invalid-settings"},{"error",e.Message+" Исправьте local/r7-settings.json для AI Assistant Host."}};}
    if(String.IsNullOrWhiteSpace(configured)&&!automatic)configured=Environment.GetEnvironmentVariable("R7_EXE");
    if(!String.IsNullOrWhiteSpace(configured))try{return new Dictionary<string,object>{{"ok",true},{"executable",Validate(configured)},{"source","configured"}};}catch(Exception e){return new Dictionary<string,object>{{"ok",false},{"error",e.Message+" Проверьте путь в local/r7-settings.json для AI Assistant Host."},{"reason","invalid-configured-path"}};}
    foreach(var hive in new[]{RegistryHive.LocalMachine,RegistryHive.CurrentUser})foreach(var view in new[]{RegistryView.Registry64,RegistryView.Registry32})try{
      using(var registry=RegistryKey.OpenBaseKey(hive,view)){
        foreach(string name in new[]{"DesktopEditors.exe","editors.exe"})using(var key=registry.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\App Paths\"+name)){if(key!=null)Add(found,ExecutableValue(Convert.ToString(key.GetValue(null))),"registry-app-path");}
        using(var uninstall=registry.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall"))if(uninstall!=null)foreach(string name in uninstall.GetSubKeyNames())try{using(var key=uninstall.OpenSubKey(name)){string display=Convert.ToString(key.GetValue("DisplayName"));if(display.IndexOf("Р7",StringComparison.OrdinalIgnoreCase)<0&&display.IndexOf("R7",StringComparison.OrdinalIgnoreCase)<0)continue;DirectoryCandidates(found,Convert.ToString(key.GetValue("InstallLocation")),"registry-installation");Add(found,ExecutableValue(Convert.ToString(key.GetValue("DisplayIcon"))),"registry-installation");}}catch{}
      }
    }catch{}
    foreach(var folder in new[]{Environment.SpecialFolder.ProgramFiles,Environment.SpecialFolder.ProgramFilesX86}){string basePath=Environment.GetFolderPath(folder);if(!String.IsNullOrEmpty(basePath))DirectoryCandidates(found,Path.Combine(basePath,"R7-Office"),"program-files");}
    var running=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    foreach(string name in new[]{"DesktopEditors","editors"})foreach(var process in Process.GetProcessesByName(name))using(process)try{string exe=Validate(process.MainModule.FileName);if(found.ContainsKey(exe))running.Add(exe);}catch{}
    var choices=new List<object>();foreach(var item in found)choices.Add(new {executable=item.Key,source=item.Value,running=running.Contains(item.Key)});
    string selected=SelectKnown(found,running);
    if(selected!=null)return new Dictionary<string,object>{{"ok",true},{"executable",selected},{"source",running.Count==1?"running-registered-editor":found[selected]},{"installations",choices}};
    return new Dictionary<string,object>{{"ok",false},{"reason",found.Count==0?"not-found":"ambiguous"},{"error",found.Count==0?"Установка Р7-Офис не найдена. Укажите DesktopEditors.exe в local/r7-settings.json для AI Assistant Host.":"Найдено несколько установок Р7-Офис. Запустите одну нужную версию либо укажите её в local/r7-settings.json для AI Assistant Host."},{"installations",choices}};
  }
  public static string SelectKnown(Dictionary<string,string> found,HashSet<string> running){
    string selected=null;int count=0;foreach(string path in running)if(found.ContainsKey(path)){selected=path;count++;}
    if(count==1)return selected;if(count>1)return null;
    if(found.Count==1)foreach(string path in found.Keys)return path;return null;
  }
}

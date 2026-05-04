import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { calibrateHandApi } from "@/lib/hand-api";
import { useToast } from "@/hooks/use-toast";
import { Save, Camera, Cpu } from "lucide-react";

export default function Settings() {
  const [cameraIndex, setCameraIndex] = useState("0");
  const [enabled, setEnabled] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await calibrateHandApi(parseInt(cameraIndex), enabled);
      toast({
        title: "Settings Saved",
        description: "Tracker calibrated successfully.",
      });
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to calibrate tracker.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Layout>
      <div className="p-6 max-w-3xl mx-auto space-y-8">
        <div>
          <h2 className="text-3xl font-black uppercase tracking-tight">Configuration</h2>
          <p className="text-muted-foreground font-medium">Fine-tune the gesture tracking engine.</p>
        </div>

        <div className="bg-white p-8 rounded-xl border-2 border-border shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] space-y-8">
          
          <div className="space-y-4 pb-8 border-b-2 border-border/50">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-md text-primary">
                <Camera className="w-5 h-5" />
              </div>
              <h3 className="font-bold uppercase text-lg">Input Source</h3>
            </div>
            
            <div className="grid gap-2 pl-12">
              <Label className="font-bold uppercase text-xs text-muted-foreground tracking-wider">Webcam Index</Label>
              <Select value={cameraIndex} onValueChange={setCameraIndex}>
                <SelectTrigger className="w-[300px] border-2 border-border focus:ring-primary font-medium">
                  <SelectValue placeholder="Select camera" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Camera 0 (Default / Built-in)</SelectItem>
                  <SelectItem value="1">Camera 1 (External)</SelectItem>
                  <SelectItem value="2">Camera 2</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">If the tracker fails to capture, try changing the camera index.</p>
            </div>
          </div>

          <div className="space-y-4 pb-8 border-b-2 border-border/50">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-secondary/10 rounded-md text-secondary">
                <Cpu className="w-5 h-5" />
              </div>
              <h3 className="font-bold uppercase text-lg">Processing Engine</h3>
            </div>
            
            <div className="flex items-center justify-between pl-12">
              <div className="space-y-1">
                <Label className="font-bold uppercase text-sm">MediaPipe Processing</Label>
                <p className="text-xs text-muted-foreground">Enable or disable background hand detection.</p>
              </div>
              <Switch 
                checked={enabled} 
                onCheckedChange={setEnabled}
                className="data-[state=checked]:bg-primary"
              />
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <Button 
              onClick={handleSave} 
              disabled={isSaving}
              size="lg"
              className="font-bold uppercase tracking-wider border-2 border-border shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] transition-all"
            >
              <Save className="mr-2 w-4 h-4" />
              {isSaving ? "Applying..." : "Apply Configuration"}
            </Button>
          </div>

        </div>
      </div>
    </Layout>
  );
}

import { Layout } from "@/components/layout";
import { useListGestures, useCreateGesture, useDeleteGesture, getListGesturesQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Hand, HandMetal, HandFist, Pointer, Trash2, Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  action: z.string().min(1, "Action is required"),
  description: z.string().optional(),
});

const GESTURE_ACTIONS = [
  { value: "rotate", label: "Rotate View" },
  { value: "zoom_in", label: "Zoom In" },
  { value: "zoom_out", label: "Zoom Out" },
  { value: "highlight", label: "Highlight Object" },
  { value: "click", label: "Click Action" },
];

export default function Gestures() {
  const { data: gestures = [], isLoading } = useListGestures();
  const createGesture = useCreateGesture();
  const deleteGesture = useDeleteGesture();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "open_hand",
      action: "rotate",
      description: "",
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    createGesture.mutate(
      { data: values },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListGesturesQueryKey() });
          form.reset();
          toast({ title: "Gesture mapping created", description: "Your new mapping is active." });
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to create gesture mapping.", variant: "destructive" });
        }
      }
    );
  };

  const getGestureIcon = (name: string) => {
    if (name.includes("open")) return <Hand className="w-5 h-5" />;
    if (name.includes("fist")) return <HandFist className="w-5 h-5" />;
    if (name.includes("point")) return <Pointer className="w-5 h-5" />;
    if (name.includes("pinch")) return <HandMetal className="w-5 h-5" />;
    return <Hand className="w-5 h-5" />;
  };

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto space-y-8">
        <div>
          <h2 className="text-3xl font-black uppercase tracking-tight">Gesture Library</h2>
          <p className="text-muted-foreground font-medium">Map hand topologies to interface actions.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-1 space-y-6 bg-white p-6 rounded-xl border-2 border-border shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] h-fit">
            <div>
              <h3 className="font-bold text-lg uppercase">Add Mapping</h3>
              <p className="text-sm text-muted-foreground mb-4">Define a new gesture action.</p>
            </div>
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <Label className="uppercase font-bold text-xs tracking-wider">Gesture Type</Label>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="border-2 border-border bg-background focus:ring-primary font-medium">
                            <SelectValue placeholder="Select gesture" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="open_hand">Open Hand</SelectItem>
                          <SelectItem value="pinch">Pinch</SelectItem>
                          <SelectItem value="fist">Fist</SelectItem>
                          <SelectItem value="point">Point</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="action"
                  render={({ field }) => (
                    <FormItem>
                      <Label className="uppercase font-bold text-xs tracking-wider">Action</Label>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="border-2 border-border bg-background focus:ring-primary font-medium">
                            <SelectValue placeholder="Select action" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {GESTURE_ACTIONS.map(action => (
                            <SelectItem key={action.value} value={action.value}>{action.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <Label className="uppercase font-bold text-xs tracking-wider">Description</Label>
                      <FormControl>
                        <Input {...field} placeholder="Optional context" className="border-2 border-border" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" disabled={createGesture.isPending} className="w-full font-bold uppercase tracking-wider border-2 border-border shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] transition-all">
                  {createGesture.isPending ? "Saving..." : "Save Mapping"}
                  <Plus className="ml-2 w-4 h-4" />
                </Button>
              </form>
            </Form>
          </div>

          <div className="md:col-span-2">
            <div className="bg-white rounded-xl border-2 border-border shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/50 border-b-2 border-border">
                  <TableRow>
                    <TableHead className="font-bold uppercase text-xs tracking-wider text-foreground">Gesture</TableHead>
                    <TableHead className="font-bold uppercase text-xs tracking-wider text-foreground">Action</TableHead>
                    <TableHead className="font-bold uppercase text-xs tracking-wider text-foreground">Added</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground font-mono">Loading mappings...</TableCell>
                    </TableRow>
                  ) : gestures.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                        <div className="flex flex-col items-center gap-2">
                          <HandMetal className="w-8 h-8 opacity-50" />
                          <p className="font-medium">No gesture mappings defined.</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    gestures.map((gesture) => (
                      <TableRow key={gesture.id} className="border-b border-border/50">
                        <TableCell className="font-bold uppercase">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/10 text-primary rounded-md border border-primary/20">
                              {getGestureIcon(gesture.name)}
                            </div>
                            {gesture.name.replace("_", " ")}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-secondary text-secondary-foreground">
                            {gesture.action}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground font-mono text-sm">
                          {format(new Date(gesture.createdAt), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => {
                              if (confirm("Delete this mapping?")) {
                                deleteGesture.mutate(
                                  { id: gesture.id },
                                  {
                                    onSuccess: () => {
                                      queryClient.invalidateQueries({ queryKey: getListGesturesQueryKey() });
                                      toast({ title: "Deleted", description: "Mapping removed." });
                                    }
                                  }
                                );
                              }
                            }}
                            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

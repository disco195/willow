package core;


import com.sun.jdi.*;
import com.sun.jdi.event.Event;
import core.util.EventUtil;

import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

/**
 * Inspects the received event, building the stack and heap data and references.
 */
public final class Inspector {

    private Inspector() {
    }

    /**
     * Inspects the program state. Analyses the stack and heap, collecting the objects.
     */
    public static Map<String, Object> inspect(Event event) throws IncompatibleThreadStateException {
        System.out.println(event);
        var stackInspection = inspectStack(event);
        //noinspection unchecked
        var stackFrames = (List<StackFrame>) stackInspection.get("frames");
        //noinspection unchecked
        var stackLines = (List<Map<String, Object>>) stackInspection.get("lines");

        var heapInspection = inspectHeap(event, stackFrames);
        //noinspection unchecked
        var stackReferences = (List<List<List<Object>>>) heapInspection.get("stack_references");
        //noinspection unchecked
        var heapGraph = (HashMap<Long, Map<String, Object>>) heapInspection.get("heap_graph");


        return Map.ofEntries(
                Map.entry("stack_lines", stackLines),
                Map.entry("stack_references", stackReferences),
                Map.entry("heap_graph", heapGraph)
        );
    }

    /**
     * Inspects the program stack.
     */
    private static Map<String, Object> inspectStack(Event event) throws IncompatibleThreadStateException {
        var frames = EventUtil.getStackFrames(event);
        var lines = frames.stream()
                .map(StackFrame::location)
                .map(l -> Map.ofEntries(Map.entry("name", l.method().name()), Map.entry("line", l.lineNumber() - 1)))
                .collect(Collectors.toList());

        return Map.ofEntries(Map.entry("frames", frames), Map.entry("lines", lines));
    }

    /**
     * Inspects the program heap by looking every object recursively found from the stack frames.
     */
    private static Map<String, Object> inspectHeap(Event event, List<StackFrame> stackFrames) {
        // stack refs
        var heapGraph = new HashMap<Long, Map<String, Object>>();
        var userClasses = new HashSet<String>();
        var threadReference = stackFrames.get(0).thread();
        var stackReferences = IntStream.range(0, stackFrames.size())
                .mapToObj(i -> stackFrames.get(stackFrames.size() - 1 - i))
                .map(f -> {
                    try {
                        return Map.entry(f.visibleVariables(), f.getValues(f.visibleVariables()));
                    } catch (AbsentInformationException e) {
                        throw new RuntimeException(e);
                    }
                })
                // frames get invalid after invoking methods in objects
                // because of this, all variables have to be collected before any evaluation
                .collect(Collectors.toList())
                .stream()
                .map(e -> e.getKey().stream()
                        .map(l -> new HashMap.SimpleEntry<>(l, e.getValue().get(l)))
                        .map(ee -> Arrays.asList(
                                ee.getKey().name(), inspectObject(ee.getValue(), heapGraph, userClasses, threadReference))
                        )
                        .collect(Collectors.toList())
                )
                .collect(Collectors.toList());

        return Map.ofEntries(Map.entry("stack_references", stackReferences), Map.entry("heap_graph", heapGraph));
    }

    /**
     * Inspects the received object.
     * If the object is a const (boolean, char, byte, short, int, long, float, double, null), returns its value.
     * If is a boxed primitive, returns as primitive.
     * If the object is a string, returns a string, with extra double quotes.
     * Otherwise, returns the object reference (list with a single number inside) recursively, inspecting object
     * members and filling the heap_graph and user_classes
     */
    private static Object inspectObject(Object obj, Map<Long, Map<String, Object>> heapGraph, Set<String> userClasses, ThreadReference threadReference) {

        // mirrored or non mirrored null values are always null
        if (obj == null) return null;

        // non mirrored values
        if (!(obj instanceof Value)) return obj;

        // non boxed primitives
        if (obj instanceof PrimitiveValue) {
            if (obj instanceof BooleanValue) return ((BooleanValue) obj).value();
            if (obj instanceof CharValue) return ((CharValue) obj).value();
            if (obj instanceof ByteValue) return ((ByteValue) obj).value();
            if (obj instanceof ShortValue) return ((ShortValue) obj).value();
            if (obj instanceof IntegerValue) return ((IntegerValue) obj).value();
            if (obj instanceof LongValue) return ((LongValue) obj).value();
            if (obj instanceof FloatValue) return ((FloatValue) obj).value();
            if (obj instanceof DoubleValue) return ((DoubleValue) obj).value();
        }

        // default strings
        if (obj instanceof StringReference) {
            return "\"" + ((StringReference) obj).value() + "\"";
        }

        // all other objects
        if (obj instanceof ObjectReference) {
            var objRef = (ObjectReference) obj;

            // boxed primitives
            try {
                var objClass = Class.forName(objRef.referenceType().name());
                if (Boolean.class.isAssignableFrom(objClass) || Character.class.isAssignableFrom(objClass) ||
                        Byte.class.isAssignableFrom(objClass) || Short.class.isAssignableFrom(objClass) ||
                        Integer.class.isAssignableFrom(objClass) || Long.class.isAssignableFrom(objClass) ||
                        Float.class.isAssignableFrom(objClass) || Double.class.isAssignableFrom(objClass)) {
                    return objRef.getValue(objRef.referenceType().fieldByName("value"));
                }
            } catch (ClassNotFoundException e) {
                // array types always throw this exception
            }

            // common objects
            var reference = objRef.uniqueID();
            var type = objRef.referenceType().signature();
            List<Map.Entry<Integer, Value>> members = null;

            // arrays and collections
            if (objRef instanceof ArrayReference) {
                var arrayRef = (ArrayReference) objRef;
                var arrayLength = arrayRef.length();
                var arrayValues = arrayRef.getValues();
                members = IntStream.range(0, arrayLength)
                        .mapToObj(i -> new HashMap.SimpleEntry<>(i, arrayValues.get(i)))
                        .collect(Collectors.toList());
            }

            try {
                var objClass = Class.forName(objRef.referenceType().name());
                if (List.class.isAssignableFrom(objClass)) {
                    var arrayRef = (ArrayReference) objRef.invokeMethod(
                            threadReference,
                            objRef.referenceType().methodsByName("toArray", "()[Ljava/lang/Object;").get(0),
                            List.of(),
                            ObjectReference.INVOKE_SINGLE_THREADED
                    );
                    var arrayLength = arrayRef.length();
                    var arrayValues = arrayRef.getValues();
                    members = IntStream.range(0, arrayLength)
                            .mapToObj(i -> new HashMap.SimpleEntry<>(i, arrayValues.get(i)))
                            .collect(Collectors.toList());
                }
            } catch (InvalidTypeException | ClassNotLoadedException | IncompatibleThreadStateException | InvocationException e) {
                // invoke errors
            } catch (ClassNotFoundException e) {
                // array types always throw this exception (already checked)
            }


            if (members != null) {
                heapGraph.put(reference, null);
                var membersInspections = members.stream()
                        .map(e -> Arrays.asList(
                                inspectObject(e.getKey(), heapGraph, userClasses, threadReference),
                                inspectObject(e.getValue(), heapGraph, userClasses, threadReference)
                        ))
                        .collect(Collectors.toList());
                heapGraph.put(
                        reference,
                        Map.ofEntries(Map.entry("type", type), Map.entry("members", membersInspections))
                );
                return List.of(reference);
            }
        }
        return "unknown element";
    }
}

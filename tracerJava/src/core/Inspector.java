package core;

import com.sun.jdi.*;
import com.sun.jdi.event.*;
import core.util.EventUtil;
import core.util.ExceptionUtil;

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
    public static Map<String, Object> inspect(Event event, Map<String, Object> previousEventData) throws IncompatibleThreadStateException {
        String eventType;
        if (event instanceof MethodEntryEvent) {
            eventType = "call";
        } else if (event instanceof MethodExitEvent || event instanceof ThreadDeathEvent) {
            eventType = "return";
        } else if (event instanceof ExceptionEvent) {
            eventType = "exception";
        } else {
            eventType = "line";
        }

        if (event instanceof ThreadDeathEvent) {
            previousEventData.put("name", eventType);
            previousEventData.put("args", null);
            previousEventData.put("finish", true);
            return previousEventData;
        }

        var stackInspection = inspectStack(event);
        //noinspection unchecked
        var stackFrames = (List<StackFrame>) stackInspection.get("frames");
        //noinspection unchecked
        var stackLines = (List<Map<String, Object>>) stackInspection.get("lines");

        var heapInspection = inspectHeap(event, stackFrames);
        //noinspection unchecked
        var stackReferences = (List<List<List<Object>>>) heapInspection.get("stackReferences");
        //noinspection unchecked
        var heapGraph = (Map<Long, Map<String, Object>>) heapInspection.get("heapGraph");
        //noinspection unchecked
        var userClasses = (Set<String>) heapInspection.get("userClasses");

        Map<String, Object> args = null;
        if (event instanceof ExceptionEvent) {
            var exceptionEvent = (ExceptionEvent) event;
            var exceptionMessage = ((StringReference) exceptionEvent.exception().getValue(
                    exceptionEvent.exception().referenceType().fieldByName("detailMessage")
            )).value();
            args = ExceptionUtil.dump(
                    exceptionEvent.exception().referenceType().name(),
                    List.of(exceptionMessage),
                    exceptionMessage
            );
        }
        // ((ExceptionEvent) event).exception().referenceType()
        //var args = eventType.equals("exception") ? null : null;

        var finish = eventType.equals("return") && stackFrames.size() == 1;

        var result = new HashMap<String, Object>(); // Map.of does not support null keys or values
        result.put("name", eventType);
        result.put("args", args);
        result.put("line", stackLines.get(0).get("line"));
        result.put("stackLines", stackLines);
        result.put("stackReferences", stackReferences);
        result.put("heapGraph", heapGraph);
        result.put("userClasses", userClasses);
        result.put("finish", finish);
        return result;
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

        return Map.ofEntries(
                Map.entry("stackReferences", stackReferences),
                Map.entry("heapGraph", heapGraph),
                Map.entry("userClasses", userClasses)
        );
    }

    /**
     * Inspects the received object.
     * If the object is a const (boolean, char, byte, short, int, long, float, double, null), returns its value.
     * If is a boxed primitive, returns as primitive.
     * If the object is a string, returns a string, with extra double quotes.
     * Otherwise, returns the object reference (list with a single number inside) recursively, inspecting object
     * members and filling the heapGraph and userClasses
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
                    var primitiveValue = objRef.getValue(objRef.referenceType().fieldByName("value"));
                    if (primitiveValue instanceof PrimitiveValue) {
                        if (primitiveValue instanceof BooleanValue) return ((BooleanValue) primitiveValue).value();
                        if (primitiveValue instanceof CharValue) return ((CharValue) primitiveValue).value();
                        if (primitiveValue instanceof ByteValue) return ((ByteValue) primitiveValue).value();
                        if (primitiveValue instanceof ShortValue) return ((ShortValue) primitiveValue).value();
                        if (primitiveValue instanceof IntegerValue) return ((IntegerValue) primitiveValue).value();
                        if (primitiveValue instanceof LongValue) return ((LongValue) primitiveValue).value();
                        if (primitiveValue instanceof FloatValue) return ((FloatValue) primitiveValue).value();
                        if (primitiveValue instanceof DoubleValue) return ((DoubleValue) primitiveValue).value();
                    }
                }
            } catch (ClassNotFoundException e) {
                // array types always throw this exception
            }

            // common objects
            var reference = objRef.uniqueID();
            var genericType = "";
            var languageType = objRef.referenceType().name();
            List<Map.Entry> members = null;

            // arrays
            if (objRef instanceof ArrayReference) {
                var arrayRef = (ArrayReference) objRef;
                var arrayLength = arrayRef.length();
                var arrayValues = arrayRef.getValues();
                members = IntStream.range(0, arrayLength)
                        .mapToObj(i -> new HashMap.SimpleEntry<>(i, arrayValues.get(i)))
                        .collect(Collectors.toList());
                genericType = "list";
            }

            try {
                var objClass = Class.forName(objRef.referenceType().name());

                // Lists and Sets
                if (List.class.isAssignableFrom(objClass) || Set.class.isAssignableFrom(objClass)) {
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
                    genericType = List.class.isAssignableFrom(objClass) ? "list" : "set";

                    // Maps
                } else if (Map.class.isAssignableFrom(objClass)) {
                    var setRef = (ObjectReference) objRef.invokeMethod(
                            threadReference,
                            objRef.referenceType().methodsByName("entrySet").get(0),
                            List.of(),
                            ObjectReference.INVOKE_SINGLE_THREADED
                    );
                    var arrayRef = (ArrayReference) setRef.invokeMethod(
                            threadReference,
                            setRef.referenceType().methodsByName("toArray", "()[Ljava/lang/Object;").get(0),
                            List.of(),
                            ObjectReference.INVOKE_SINGLE_THREADED
                    );

                    var arrayLength = arrayRef.length();
                    var arrayValues = arrayRef.getValues();
                    members = arrayValues.stream()
                            .map(v -> (ObjectReference) v)
                            .map(v -> {
                                        try {
                                            return new HashMap.SimpleEntry<>(
                                                    v.invokeMethod(
                                                            threadReference,
                                                            v.referenceType().methodsByName("getKey").get(0),
                                                            List.of(),
                                                            ObjectReference.INVOKE_SINGLE_THREADED
                                                    ),
                                                    v.invokeMethod(
                                                            threadReference,
                                                            v.referenceType().methodsByName("getValue").get(0),
                                                            List.of(),
                                                            ObjectReference.INVOKE_SINGLE_THREADED
                                                    )
                                            );
                                        } catch (Exception e) {
                                            throw new RuntimeException(e);
                                        }
                                    }
                            )
                            .collect(Collectors.toList());
                    genericType = "map";
                }
            } catch (ClassNotFoundException | InvalidTypeException | ClassNotLoadedException | IncompatibleThreadStateException | InvocationException | RuntimeException e) {
                // ignore errors
            }

            // locally declared classes
            var classReferenceData = objRef.referenceType().toString().split(" ");
            if (classReferenceData[0].equals("class") && !classReferenceData[1].contains(".")) {
                var orderedFields = objRef.referenceType().allFields();
                var fieldsValues = objRef.getValues(orderedFields);
                userClasses.add(classReferenceData[1]);
                members = orderedFields.stream()
                        .map(f -> new HashMap.SimpleEntry<>(f.name(), fieldsValues.get(f)))
                        .collect(Collectors.toList());
                genericType = "udo";
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
                        Map.ofEntries(
                                Map.entry("type", genericType),
                                Map.entry("languageType", languageType),
                                Map.entry("members", membersInspections)
                        )
                );
                return List.of(reference);
            } else {
                return languageType;
            }
        }
        return "unknown element";
    }
}
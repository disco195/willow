package message;

/**
 * Action message type.
 */
public class ActionMessage extends Message {
    private Action action;

    public ActionMessage(Action action, Object value) {
        super(value);
        this.action = action;
    }

    public Action getAction() {
        return action;
    }

    /**
     * List of available actions that can be sent to the tracer.
     */
    public enum Action {
        start,
        stop,
        step,
        eval,
        input
    }
}

import multiprocessing as mp

from core import tracer
import events


class TracerBroker:
    """
    Provides an easy interface for comunicating with the Tracer as it has to run in another process.
    """

    def __init__(self, name: str, script: str, sandbox: bool):
        """
        Stores the Tracer parameters for posterior usage when starting the Tracer.
        """
        self._name = name
        self._script = script
        self._sandbox = sandbox
        self._manager = None
        self._action_queue = None
        self._result_queue = None
        self._tracer_process = None

    def is_tracer_running(self):
        """
        Returns true if the tracer is running.
        """
        return self._tracer_process is not None

    def start(self):
        """
        Starts the tracer in a new process.
        """
        if self.is_tracer_running():
            raise AssertionError('tracer already running')

        self._manager = mp.Manager()
        self._action_queue = self._manager.Queue()
        self._result_queue = self._manager.Queue()
        self._tracer_process = mp.Process(
            target=tracer.Tracer.init_run,
            args=(self._name, self._script, self._sandbox, self._action_queue, self._result_queue)
        )
        self._tracer_process.start()

        self._action_queue.put(events.Event(events.Actions.START))
        result = self._result_queue.get()

        if result.name == events.Results.ERROR:
            self.stop()

        return [result]

    def stop(self):
        """
        Stops the tracer process and queues.
        """
        if not self.is_tracer_running():
            raise AssertionError('tracer already stopped')

        self._action_queue.put(events.Event(events.Actions.QUIT))

        self._tracer_process.terminate()
        self._tracer_process.join()
        self._tracer_process = None
        self._manager = None
        self._action_queue = None
        self._result_queue = None

    def step(self, count:  int = 1):
        """
        Steps into the script.
        """
        if not self.is_tracer_running():
            raise AssertionError('tracer not running')
        if count < 1:
            raise AssertionError('count smaller than 1')

        self._action_queue.put(events.Event(events.Actions.STEP, {'count': 1}))
        results = []
        while True:
            result = self._result_queue.get()
            results.append(result)
            if result.name in {events.Results.DATA, events.Results.ERROR, events.Results.LOCKED}:
                break

        if result.name == events.Results.DATA and result.value['finish'] or result.name == events.Results.ERROR:
            self.stop()

        return results

    def eval(self, expression: str):
        """
        Evaluates an expression in the current script scope.
        """
        if not self.is_tracer_running():
            raise AssertionError('tracer not running')

        self._action_queue.put(events.Event(events.Actions.EVAL, {'expression': expression, 'inspect': True}))
        results = []
        while True:
            result = self._result_queue.get()
            results.append(result)
            if result.name in {events.Results.PRODUCT, events.Results.ERROR, events.Results.LOCKED}:
                break

        if result.name == events.Results.ERROR:
            self.stop()

        return results

    def input(self, data: str):
        """
        Sends a input string to script. Inputs have no response.
        """
        if not self.is_tracer_running():
            raise AssertionError('tracer not running')
        if not data:
            raise AttributeError('data cannot be None')

        self._action_queue.put(events.Event(events.Actions.INPUT, {'input': data}))

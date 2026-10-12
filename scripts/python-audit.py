"""Use the OS certificate store; never disable TLS verification for advisories."""
import runpy
import sys
from pip._vendor import truststore
truststore.inject_into_ssl()
sys.argv = ['pip-audit', '--progress-spinner', 'off', '--format', 'json']
runpy.run_module('pip_audit', run_name='__main__')

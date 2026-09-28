import { Component } from 'react'

export default class RouteLoadBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return (
        <div role="alert" style={{ padding: 32, textAlign: 'center' }}>
          <p>No se pudo cargar la página. Comprueba tu conexión e inténtalo de nuevo.</p>
          <button type="button" onClick={() => window.location.reload()}>
            Volver a cargar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

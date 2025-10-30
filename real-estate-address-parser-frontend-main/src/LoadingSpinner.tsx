const LoadingSpinner = () => {
  const spinnerStyle = {
    display: 'inline-block',
    width: '110px',
    height: '110px',
  };

  const spinnerAfterStyle = {
    content: " ",
    display: 'block',
    width: '110px',
    height: '110px',
    margin: '8px',
    borderRadius: '50%',
    border: '10px solid red',
    borderColor: 'red transparent black transparent',
    animation: 'spinner 1.2s linear infinite',
  };

  const keyframesStyle = `
    @keyframes spinner {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;

  return (
    <div style={{ textAlign: 'center' }}>
      <style>{keyframesStyle}</style>
      <div style={spinnerStyle}>
        <div style={spinnerAfterStyle}></div>
      </div>
    </div>
  );
};

export default LoadingSpinner;

/**
 * Diputado.js
 *
 * @description :: TODO: You might write a short summary of how this model works and what it represents here.
 * @docs		:: http://sailsjs.org/#!documentation/models
 */

module.exports = {
	attributes: {
		comisiones: {
			collection: 'comision',
			via: 'diputados',
		},
		asistencias: {
			collection: 'asistencia',
			via: 'diputado',
			dominant: true
		},
		max_grado : function(){
			var grado = {'index': -1, titulo:'no disponible', fecha:''};
			if(typeof(this.curriculum.escolaridad)){
				var grados = ['Licenciatura','Maestria','Doctorado'];
				this.curriculum.escolaridad.forEach(function(item){
					var i = grados.indexOf(item.posicion);
					if(i > grado.index){
						grado.index = i;
						grado.titulo = item.organizacion;
						grado.fecha = item.fecha;
					};
				});
				return grados[grado.index]+' en '+grado.titulo.toLowerCase();
			}
			return "no disponible";
		},

	},
};
